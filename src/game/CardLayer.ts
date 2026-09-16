import { type Card, type GameState, DECK_SIZE } from "../engine/index.ts";
import {
  type Metrics,
  type Placement,
  Z_DRAG,
  Z_FLIGHT,
  cssVariables,
  placeAll,
} from "./Layout.ts";

/**
 * The 52 cards, as 52 DOM elements that exist from one deal to the next and
 * are never created, destroyed or re-parented.
 *
 * **This layer is not reactive.** Svelte renders the elements once and hands
 * them over; from then on every position is a `transform` written from here.
 * A move is a changed transform with a CSS transition on it — no FLIP, no
 * cloning into a flying layer, no measuring. That is what makes animations
 * interruptible for free and keeps the whole board on the compositor. See
 * docs/05-interaction-and-motion.md and the boundary rule in
 * docs/07-architecture.md.
 *
 * Nothing here reads layout. Geometry arrives from {@link Metrics}, computed
 * once per resize.
 */

/**
 * What a deck of drawn art tells the card layer: how big one card is inside
 * the sprite, and which group in it a given card is. See src/decks/sourced.ts.
 */
export interface DeckArt {
  viewBox: string;
  paper: string;
  symbol: (card: Card) => string;
}

/** How a change of position should look. The catalogue is in docs/05. */
export type Motion =
  "instant" | "move" | "deal" | "draw" | "drop" | "undo" | "recycle" | "peek";

interface Style {
  className: string;
  /** Milliseconds between one staggered card leaving and the next. */
  stagger: number;
}

const MOTION: Record<Exclude<Motion, "instant">, Style> = {
  move: { className: "is-moving", stagger: 0 },
  // A deal is the workhorse move twenty-eight times over. The stagger is the
  // whole of why it reads as dealt rather than drawn, and at 22ms the last
  // card leaves the stock a little over 600ms after the first.
  deal: { className: "is-moving", stagger: 22 },
  // Draw-3 fans out one card after another; in draw-1 there is only ever one
  // card in the order, so the stagger costs nothing.
  draw: { className: "is-moving", stagger: 60 },
  drop: { className: "is-settling", stagger: 0 },
  // Deliberately slower than the move it reverses, so you can see what came back.
  undo: { className: "is-undoing", stagger: 0 },
  // The whole waste, back under the stock as one block with a slight arc.
  recycle: { className: "is-sweeping", stagger: 0 },
  // A column opening under a long press, and closing again when it ends.
  peek: { className: "is-peeking", stagger: 0 },
};

/**
 * Every class that arms a transition. A card wears one for exactly as long as
 * it is moving, which is also what keeps `will-change` off the other fifty-one.
 */
const MOTION_CLASSES = [
  "is-moving",
  "is-settling",
  "is-undoing",
  "is-sweeping",
  "is-peeking",
  "is-flipping",
] as const;

/**
 * Long enough for the slowest of those transitions plus slack, over and above
 * whatever the stagger added. It only decides when the flight z-lift and
 * `will-change` come off, both of which are invisible, so it does not need to
 * be exact.
 */
const FLIGHT_MS = 400;

/** The springs-back-to-where-it-came-from animation, per the move catalogue. */
const RETURN_MS = 220;

export class CardLayer {
  readonly #layer: HTMLElement;
  readonly #elements: HTMLElement[];
  readonly #reduced: boolean;
  #metrics: Metrics | null = null;
  #placements: Placement[] = [];
  #held: readonly Card[] = [];
  #flight: ReturnType<typeof setTimeout> | undefined;
  #rect: DOMRect | null = null;
  #peek: number | null = null;
  #surrendered = false;
  #hinted: Card[] = [];
  #selected: Card[] = [];

  /**
   * `reducedMotion` zeroes the staggers. The durations take care of
   * themselves — they are custom properties that the media query in
   * `motion.css` collapses to 1ms — but a stagger is an index times a number
   * and the number has to come from somewhere.
   */
  constructor(layer: HTMLElement, reducedMotion = false) {
    this.#layer = layer;
    this.#reduced = reducedMotion;
    const found = layer.querySelectorAll<HTMLElement>("[data-card]");
    if (found.length !== DECK_SIZE) {
      throw new Error(`card layer holds ${found.length} cards, expected 52`);
    }
    this.#elements = new Array(DECK_SIZE);
    for (const element of found) {
      this.#elements[Number(element.dataset.card)] = element;
    }
  }

  get metrics(): Metrics | null {
    return this.#metrics;
  }

  /**
   * Point the 52 faces at a sourced deck's sprite, or take them off it.
   *
   * This is the only thing a deck of drawn art changes: one `<use>` per card,
   * written once when the deck changes, and a class that lets the CSS show
   * the art and stand our own corner index on top of it. The elements are the
   * same elements — a deck is not a reason to rebuild the card layer, and
   * doing it from here rather than from Svelte is what keeps that true.
   *
   * `null` is the decks we draw ourselves, which have no art to point at.
   */
  setArt(art: DeckArt | null): void {
    this.#layer.classList.toggle("has-art", art !== null);
    // What our corner index is drawn on: the deck's own paper, not the
    // table's card colour, or every card gets a square of the wrong white.
    if (art === null) this.#layer.style.removeProperty("--art-paper");
    else this.#layer.style.setProperty("--art-paper", art.paper);
    for (let card = 0; card < DECK_SIZE; card++) {
      const element = this.#elements[card] as HTMLElement;
      const svg = element.querySelector(".card-art");
      const use = svg?.firstElementChild;
      if (svg == null || use == null) continue;
      if (art === null) {
        use.removeAttribute("href");
        continue;
      }
      svg.setAttribute("viewBox", art.viewBox);
      use.setAttribute("href", `#${art.symbol(card)}`);
    }
  }

  /**
   * New geometry. The custom properties go on the board element so the
   * server-rendered slots move with the cards — CSS is told the numbers, it
   * never works them out.
   */
  setMetrics(m: Metrics, board: HTMLElement): void {
    this.#metrics = m;
    for (const [name, value] of Object.entries(cssVariables(m))) {
      board.style.setProperty(name, value);
    }
    this.#rect = null;
  }

  /** Pointer coordinates in card-layer space. One layout read, never mid-move. */
  pointOf(event: { clientX: number; clientY: number }): {
    x: number;
    y: number;
  } {
    this.#rect ??= this.#layer.getBoundingClientRect();
    return {
      x: event.clientX - this.#rect.left,
      y: event.clientY - this.#rect.top,
    };
  }

  /** Where a card currently rests, ignoring any drag offset on top of it. */
  placementOf(card: Card): Placement | undefined {
    return this.#placements[card];
  }

  /** Forget the cached rect — the board has moved or resized. */
  invalidate(): void {
    this.#rect = null;
  }

  /**
   * Put every card where the position says it belongs. Cards that did not move
   * are written anyway (it is one string assignment and the compositor ignores
   * an unchanged transform) so there is no bookkeeping to get wrong.
   *
   * `order` is the cards a staggered motion runs along, first to leave first.
   * Everything not in it starts immediately; for an unstaggered motion it is
   * ignored entirely.
   */
  render(
    state: GameState,
    motion: Motion = "move",
    order: readonly Card[] = [],
  ): void {
    const m = this.#metrics;
    // Once the win sequence owns the cards, a resize must not put them back on
    // their foundations mid-flight.
    if (m === null || this.#surrendered) return;

    const next = placeAll(m, state, this.#peek);
    // `null` is "arrive immediately": no class, so no transition is armed.
    const style = motion === "instant" ? null : MOTION[motion];
    const delays = this.#delays(style, order);
    let inFlight = false;
    let last = 0;

    for (let card = 0; card < DECK_SIZE; card++) {
      const to = next[card] as Placement;
      const element = this.#elements[card] as HTMLElement;
      const was = this.#placements[card];
      const moved = was === undefined || was.x !== to.x || was.y !== to.y;
      const turned = was !== undefined && was.faceUp !== to.faceUp;

      // A card under the pointer is the drag's to write. Its new resting place
      // is still recorded below, because that is what it springs back to.
      if (this.#held.includes(card)) continue;

      element.classList.remove("is-returning");

      if (style === null) {
        // A card only ever animates because it is wearing a motion class, so
        // taking them off is the whole of "arrive immediately". No transition
        // is armed, so nothing needs flushing first.
        element.classList.remove(...MOTION_CLASSES);
        element.style.removeProperty("--delay");
        element.style.zIndex = String(to.z);
      } else {
        const delay = delays[card] ?? 0;
        if (delay > 0) element.style.setProperty("--delay", `${delay}ms`);
        else element.style.removeProperty("--delay");

        // A card that turns over animates even when it does not move: the
        // column top a move exposes is the commonest flip in the game.
        if (turned) element.classList.add("is-flipping");
        if (moved) element.classList.add(style.className);
        if (turned || moved) {
          inFlight = true;
          last = Math.max(last, delay);
        }
        element.style.zIndex = String(moved ? Z_FLIGHT + to.z : to.z);
      }

      element.classList.toggle("is-face-down", !to.faceUp);
      element.style.transform = translate(to.x, to.y);
    }

    this.#placements = next;
    if (inFlight) this.#scheduleLanding(last);
  }

  /**
   * Fan a column right out for as long as a long press lasts, or put it back
   * when `column` is `null`.
   *
   * This is geometry, not game state — the position underneath is untouched,
   * and the hit-test that started the press was taken against the collapsed
   * column, so a press that turns into a drag picks up exactly the card it
   * was always going to.
   */
  peek(column: number | null, state: GameState): void {
    if (this.#peek === column) return;
    this.#peek = column;
    this.render(state, "peek");
  }

  /**
   * Take the transitions off the held stack and lift it above everything. The
   * dragged stack follows the pointer with zero smoothing, so any transition
   * on it would read as lag.
   */
  beginDrag(cards: readonly Card[]): void {
    this.#held = cards;
    cards.forEach((card, i) => {
      const element = this.#elements[card] as HTMLElement;
      element.classList.add("is-dragging");
      element.classList.remove(...MOTION_CLASSES, "is-returning");
      element.style.removeProperty("--delay");
      element.style.zIndex = String(Z_DRAG + i);
    });
  }

  /**
   * `tilt` is a small rotation proportional to horizontal velocity — subtle
   * enough that you feel it rather than see it.
   */
  dragBy(dx: number, dy: number, tilt: number): void {
    for (const card of this.#held) {
      const at = this.#placements[card] as Placement;
      (this.#elements[card] as HTMLElement).style.transform =
        `${translate(at.x + dx, at.y + dy)} scale(1.04) rotate(${tilt}deg)`;
    }
  }

  /**
   * Drop the stack back where it was picked up, along a short spring. It does
   * not snap (which feels like a bug) and it does not stay where it was let
   * go. Takes the cards explicitly so a caller that has already released the
   * drag can still send them home.
   */
  returnHome(cards: readonly Card[] = this.#held): void {
    this.endDrag();
    for (const card of cards) {
      const element = this.#elements[card] as HTMLElement;
      const at = this.#placements[card] as Placement;
      element.classList.add("is-returning");
      element.style.transform = translate(at.x, at.y);
    }
    setTimeout(() => {
      for (const card of cards) {
        (this.#elements[card] as HTMLElement).classList.remove("is-returning");
      }
    }, RETURN_MS);
  }

  endDrag(): void {
    for (const card of this.#held) {
      (this.#elements[card] as HTMLElement).classList.remove("is-dragging");
    }
    this.#held = [];
  }

  /**
   * The move a hint is pointing at: the card to move, and the card it would
   * be moved onto, pulsing together. Scale and an outline rather than a
   * colour wash, per docs/08-accessibility.md — and under reduced motion the
   * CSS turns the two pulses into an outline that stays until it is cleared.
   *
   * It survives a re-render, because the class is on the element and nothing
   * in render() takes it off. A hint you can still see while you act on it is
   * the point of one.
   *
   * The lift is an inline z-index rather than a rule in the stylesheet,
   * because render() writes one on every card and an inline style wins: a
   * card pulsing *under* the card fanned on top of it is not a highlight.
   */
  hint(cards: readonly Card[]): void {
    this.clearHint();
    for (const card of cards) {
      const element = this.#elements[card] as HTMLElement;
      void element.offsetWidth;
      element.classList.add("is-hinting");
      element.style.zIndex = String(Z_FLIGHT + card);
      this.#hinted.push(card);
    }
  }

  /**
   * Taken off by the next move, a new deal, the win, or a second hint — and
   * the lift goes back to where the card was resting, because a card left
   * above the fan it belongs under would be a glitch rather than a highlight.
   */
  clearHint(): void {
    for (const card of this.#hinted) {
      const element = this.#elements[card] as HTMLElement;
      element.classList.remove("is-hinting");
      const resting = this.#placements[card];
      if (resting !== undefined) element.style.zIndex = String(resting.z);
    }
    this.#hinted = [];
  }

  /**
   * What the keyboard has under its selection, and whether it is in hand.
   *
   * The roving focus lives on the thirteen pile elements, which is what a
   * screen reader reads; this is the same position drawn for somebody who can
   * see it. It is static — an outline and, once picked up, a lift — because
   * the selection can sit there for as long as it takes to decide where a card
   * is going, and the only continuous motion in the product is the win
   * cascade.
   *
   * Cleared and re-applied wholesale on every change, because it is at most a
   * dozen elements and a diff would be more code than the write it saves.
   */
  select(cards: readonly Card[], held = false): void {
    this.clearSelection();
    for (const card of cards) {
      const element = this.#elements[card] as HTMLElement;
      element.classList.add("is-selected");
      if (held) element.classList.add("is-held");
      this.#selected.push(card);
    }
  }

  clearSelection(): void {
    for (const card of this.#selected) {
      const element = this.#elements[card] as HTMLElement;
      element.classList.remove("is-selected", "is-held");
    }
    this.#selected = [];
  }

  /**
   * A tap with nowhere to go. A shake is enough; a red flash reads as being
   * told off.
   */
  shake(card: Card): void {
    const element = this.#elements[card] as HTMLElement;
    element.classList.remove("is-shaking");
    void element.offsetWidth;
    element.classList.add("is-shaking");
    element.addEventListener(
      "animationend",
      () => element.classList.remove("is-shaking"),
      { once: true },
    );
  }

  // ------------------------------------------------- the win sequence
  //
  // docs/06 is built on the 52 elements already being here: nothing is created
  // at win time, and the physics loop writes transforms to elements the
  // compositor has been holding all game. These four methods are the whole of
  // the handover — see WinSequence.ts for what drives them.

  /**
   * Stage 1 takes the cards. Every CSS transition comes off (a transition
   * fighting a per-frame transform write is the classic way this goes wrong),
   * `will-change` goes on all 52 at once — there is an 860ms window here to
   * absorb the layer promotion, which is exactly why it happens at Stage 1 and
   * not at Stage 2 — and everything is lifted above the trail canvas.
   */
  surrender(): void {
    clearTimeout(this.#flight);
    this.clearHint();
    this.clearSelection();
    this.#surrendered = true;
    this.#held = [];
    for (let card = 0; card < DECK_SIZE; card++) {
      const element = this.#elements[card] as HTMLElement;
      element.classList.remove(
        ...MOTION_CLASSES,
        "is-returning",
        "is-dragging",
      );
      element.style.removeProperty("--delay");
      element.classList.add("is-cascading");
      element.style.zIndex = String(Z_FLIGHT + card);
    }
  }

  /**
   * One foundation acknowledging itself, `delay` ms into Stage 1. `scale` is
   * its own property rather than part of `transform`, so this composes with
   * the translate that positions the card instead of fighting it — the same
   * trick the illegal-move shake uses.
   */
  pulse(card: Card, delayMs: number): void {
    const element = this.#elements[card] as HTMLElement;
    element.style.animationDelay = `${delayMs}ms`;
    element.classList.add("is-pulsing");
  }

  /** One card, one physics frame. The hot path: 52 of these, 60 times a second. */
  fly(card: Card, x: number, y: number, angle: number): void {
    (this.#elements[card] as HTMLElement).style.transform =
      `${translate(x, y)} rotate(${angle}deg)`;
  }

  /** Culled, or dissolved by the reduced-motion path. Either way: gone. */
  hide(card: Card, fade = false): void {
    const element = this.#elements[card] as HTMLElement;
    if (fade) element.classList.add("is-dissolving");
    else element.style.opacity = "0";
  }

  /**
   * Stage 3. `will-change` comes back off: leaving it on 52 elements costs
   * real memory on cheap GPUs, and by now nothing is moving.
   */
  settle(): void {
    for (let card = 0; card < DECK_SIZE; card++) {
      (this.#elements[card] as HTMLElement).classList.remove("is-cascading");
    }
  }

  /** Per-card start times, sparse: only a staggered motion writes any. */
  #delays(style: Style | null, order: readonly Card[]): number[] {
    const delays: number[] = [];
    const step = style === null || this.#reduced ? 0 : style.stagger;
    if (step > 0) {
      order.forEach((card, index) => {
        delays[card] = index * step;
      });
    }
    return delays;
  }

  /**
   * Drop the flight lift and `will-change` once everything has landed —
   * `last` is when the last staggered card set off, so a deal is watched for
   * as long as a deal takes. Permanent `will-change` on 52 elements costs real
   * memory on cheap GPUs.
   */
  #scheduleLanding(lastMs: number): void {
    clearTimeout(this.#flight);
    this.#flight = setTimeout(() => {
      for (let card = 0; card < DECK_SIZE; card++) {
        if (this.#held.includes(card)) continue;
        const element = this.#elements[card] as HTMLElement;
        element.classList.remove(...MOTION_CLASSES);
        element.style.removeProperty("--delay");
        element.style.zIndex = String((this.#placements[card] as Placement).z);
      }
    }, FLIGHT_MS + lastMs);
  }

  destroy(): void {
    clearTimeout(this.#flight);
  }
}

function translate(x: number, y: number): string {
  return `translate3d(${x}px, ${y}px, 0)`;
}
