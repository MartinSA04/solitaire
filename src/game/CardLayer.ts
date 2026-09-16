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

/** How a change of position should look. The catalogue is in docs/05. */
export type Motion = "instant" | "move" | "drop" | "undo";

const MOTION_CLASS: Record<Exclude<Motion, "instant">, string> = {
  move: "is-moving",
  drop: "is-settling",
  // Deliberately slower than the move it reverses, so you can see what came back.
  undo: "is-undoing",
};

/**
 * Long enough for the slowest of those transitions plus slack. It only decides
 * when the flight z-lift and `will-change` come off, both of which are
 * invisible, so it does not need to be exact.
 */
const FLIGHT_MS = 400;

/** The springs-back-to-where-it-came-from animation, per the move catalogue. */
const RETURN_MS = 220;

export class CardLayer {
  readonly #layer: HTMLElement;
  readonly #elements: HTMLElement[];
  #metrics: Metrics | null = null;
  #placements: Placement[] = [];
  #held: readonly Card[] = [];
  #flight: ReturnType<typeof setTimeout> | undefined;
  #rect: DOMRect | null = null;

  constructor(layer: HTMLElement) {
    this.#layer = layer;
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
   */
  render(state: GameState, motion: Motion = "move"): void {
    const m = this.#metrics;
    if (m === null) return;

    const next = placeAll(m, state);
    const instant = motion === "instant";
    let inFlight = false;
    for (let card = 0; card < DECK_SIZE; card++) {
      const to = next[card] as Placement;
      const element = this.#elements[card] as HTMLElement;
      const was = this.#placements[card];
      const moved = was === undefined || was.x !== to.x || was.y !== to.y;

      // A card under the pointer is the drag's to write. Its new resting place
      // is still recorded below, because that is what it springs back to.
      if (this.#held.includes(card)) continue;

      element.classList.toggle("is-face-down", !to.faceUp);
      element.classList.remove("is-returning");

      if (instant) {
        // A card only ever animates because it is wearing a motion class, so
        // taking them off is the whole of "arrive immediately". No transition
        // is armed, so nothing needs flushing first.
        element.classList.remove("is-moving", "is-settling", "is-undoing");
      }

      if (moved && !instant) {
        element.classList.add(MOTION_CLASS[motion]);
        element.style.zIndex = String(Z_FLIGHT + to.z);
        inFlight = true;
      } else {
        element.style.zIndex = String(to.z);
      }
      element.style.transform = translate(to.x, to.y);
    }

    this.#placements = next;
    if (inFlight) this.#scheduleLanding();
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
      element.classList.remove(
        "is-moving",
        "is-settling",
        "is-undoing",
        "is-returning",
      );
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

  /**
   * Drop the flight lift and `will-change` once everything has landed.
   * Permanent `will-change` on 52 elements costs real memory on cheap GPUs.
   */
  #scheduleLanding(): void {
    clearTimeout(this.#flight);
    this.#flight = setTimeout(() => {
      for (let card = 0; card < DECK_SIZE; card++) {
        if (this.#held.includes(card)) continue;
        const element = this.#elements[card] as HTMLElement;
        element.classList.remove("is-moving", "is-settling", "is-undoing");
        element.style.zIndex = String((this.#placements[card] as Placement).z);
      }
    }, FLIGHT_MS);
  }

  destroy(): void {
    clearTimeout(this.#flight);
  }
}

function translate(x: number, y: number): string {
  return `translate3d(${x}px, ${y}px, 0)`;
}
