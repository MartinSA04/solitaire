import { type Card, type GameState, type Move } from "../engine/index.ts";
import { type CardLayer, type Motion } from "./CardLayer.ts";
import {
  type Hit,
  type Metrics,
  dropTarget,
  hitTest,
  pileCards,
} from "./Layout.ts";
import { autoMove } from "./automove.ts";
import { type Grab, dropMove, grab } from "./pickup.ts";

/**
 * Pointer input for the board: one gesture grammar, `pointerdown` /
 * `pointermove` / `pointerup` with capture, no separate touch and mouse paths.
 *
 * All the geometry and all the rules live elsewhere — this file only decides
 * whether a gesture was a tap or a drag, and where the pointer is. See
 * docs/05-interaction-and-motion.md.
 */

/** Movement below this is a tap. Nothing visual happens first, so a tap never flickers. */
const DRAG_THRESHOLD = 6;

/**
 * A press held this long, without going anywhere, is a peek rather than a tap.
 * Long enough that no ordinary tap reaches it, short enough that holding still
 * feels like a deliberate act rather than a wait.
 */
const PEEK_MS = 350;

/** Degrees of tilt at 1px/ms of horizontal travel, clamped to the same. */
const TILT_PER_VELOCITY = 1.5;
const MAX_TILT = 1.5;

export interface DragHost {
  state(): GameState;
  metrics(): Metrics | null;
  /** Play a move and repaint. `false` if the engine refused it. */
  play(move: Move, motion: Motion): boolean;
  /**
   * A gesture that meant something but could not happen, and the cards it was
   * about — all of them, because a run that has nowhere to go is a run being
   * refused, not its bottom card.
   */
  illegal(cards: readonly Card[]): void;
  /** Fan a column out under a long press, or let it back down with `null`. */
  peek(column: number | null): void;
  /**
   * The cards a click here would move, for the 2px lift docs/05 gives a
   * desktop. Never called on a device without a hovering pointer.
   */
  hover(cards: readonly Card[]): void;
  /**
   * What is in hand, as it is picked up and put down. The board draws the piles
   * that would take it; see `legalTargets` in pickup.ts.
   */
  carrying(held: Grab | null): void;
}

interface Press {
  pointerId: number;
  startX: number;
  startY: number;
  hit: Hit;
  /** Set once the pointer has travelled far enough that this is no longer a tap. */
  committed: boolean;
  held: Grab | null;
  lastX: number;
  lastT: number;
  tilt: number;
  /** Pending long press, and whether it has already fanned a column out. */
  hold: ReturnType<typeof setTimeout> | undefined;
  peeked: boolean;
}

/**
 * Does this device have a pointer that hovers? A finger does not, and a touch
 * device that paid for hover tracking would be doing a hit-test per frame of
 * every scroll for a lift nobody can see.
 */
function canHover(): boolean {
  return (
    typeof matchMedia !== "undefined" &&
    matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}

export class Drag {
  readonly #target: HTMLElement;
  readonly #layer: CardLayer;
  readonly #host: DragHost;
  readonly #hovers: boolean;
  #press: Press | null = null;
  /** The last mouse position, and the frame that will do something about it. */
  #at: { x: number; y: number } | null = null;
  #frame = 0;

  constructor(target: HTMLElement, layer: CardLayer, host: DragHost) {
    this.#target = target;
    this.#layer = layer;
    this.#host = host;
    this.#hovers = canHover();
    target.addEventListener("pointerdown", this.#onDown);
    target.addEventListener("pointermove", this.#onMove);
    target.addEventListener("pointerup", this.#onUp);
    target.addEventListener("pointercancel", this.#onCancel);
    if (this.#hovers) target.addEventListener("pointerleave", this.#onLeave);
  }

  destroy(): void {
    this.#target.removeEventListener("pointerdown", this.#onDown);
    this.#target.removeEventListener("pointermove", this.#onMove);
    this.#target.removeEventListener("pointerup", this.#onUp);
    this.#target.removeEventListener("pointercancel", this.#onCancel);
    this.#target.removeEventListener("pointerleave", this.#onLeave);
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#release(this.#press);
    this.#press = null;
  }

  /**
   * The hover lift, recomputed at most once a frame.
   *
   * A hit-test walks the thirteen piles against fifty-two placements, which is
   * nothing next to a frame of compositing but is worth doing once per frame
   * rather than once per pointer event — a 120Hz mouse delivers twice as many
   * of those as there are frames to draw.
   */
  #onLeave = (): void => {
    this.#at = null;
    this.#host.hover([]);
  };

  /**
   * Take the hover lift again from where the pointer already is.
   *
   * The lift says "this is what a click would move", and after a move that is
   * a different set of cards — usually including the one that just left, which
   * is otherwise still sitting two pixels proud of its new pile with a lift
   * shadow under it until the mouse is jogged. Nothing about that is a pointer
   * event, so nothing would ask; the board asks instead, after every render.
   */
  refresh(): void {
    if (!this.#hovers || this.#at === null) return;
    this.#scheduleFrame();
  }

  #scheduleHover(event: PointerEvent): void {
    this.#at = { x: event.clientX, y: event.clientY };
    this.#scheduleFrame();
  }

  #scheduleFrame(): void {
    if (this.#frame !== 0) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      const at = this.#at;
      const m = this.#host.metrics();
      if (at === null || m === null || this.#press !== null) return;
      const point = this.#layer.pointOf({ clientX: at.x, clientY: at.y });
      const hit = hitTest(m, this.#host.state(), point.x, point.y);
      this.#host.hover(hit === null ? [] : this.#liftable(hit));
    });
  }

  /**
   * What a click on this hit would actually move: the run a drag would take,
   * or the top of the stock, which has a click of its own. A face-down card in
   * a column moves nothing, and nothing is what it should look like.
   */
  #liftable(hit: Hit): readonly Card[] {
    const state = this.#host.state();
    if (hit.ref.pile === "stock") {
      const top = state.stock[state.stock.length - 1];
      return top === undefined ? [] : [top];
    }
    return grab(state, hit)?.cards ?? [];
  }

  #onDown = (event: PointerEvent): void => {
    if (!event.isPrimary || this.#press !== null) return;
    const m = this.#host.metrics();
    if (m === null) return;

    const point = this.#layer.pointOf(event);
    const hit = hitTest(m, this.#host.state(), point.x, point.y);
    if (hit === null) return;

    // Capture up front: a drag that starts near the edge of the board must not
    // be lost to the element boundary halfway through.
    this.#target.setPointerCapture(event.pointerId);
    event.preventDefault();
    const press: Press = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      hit,
      committed: false,
      held: null,
      lastX: event.clientX,
      lastT: event.timeStamp,
      tilt: 0,
      hold: undefined,
      peeked: false,
    };
    this.#press = press;

    // Only a column can be peeked, and only one with something buried in it.
    const ref = hit.ref;
    if (
      ref.pile === "tableau" &&
      pileCards(this.#host.state(), ref).length > 1
    ) {
      press.hold = setTimeout(() => {
        press.peeked = true;
        this.#host.peek(ref.column);
      }, PEEK_MS);
    }
  };

  #onMove = (event: PointerEvent): void => {
    const press = this.#press;
    if (press === null) {
      // No button down: this is a cursor crossing the table, and all it does is
      // lift whatever it is over.
      if (this.#hovers && event.pointerType === "mouse") {
        this.#scheduleHover(event);
      }
      return;
    }
    if (press.pointerId !== event.pointerId) return;

    const dx = event.clientX - press.startX;
    const dy = event.clientY - press.startY;

    // Once a column has opened, the gesture is a peek until it is let go:
    // moving does not turn it into a drag. The cards have slid *under* a
    // finger that never moved, so the 6px that commits a drag would commit it
    // on whichever card happens to be there — never the one that was meant.
    // A peek is for reading; it does not reach.
    if (press.peeked) return;

    if (!press.committed) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      press.committed = true;
      // A press that goes somewhere is a drag, so it is no longer a long one.
      this.#release(press);
      // The stock and face-down cards have no drag; the gesture is now neither
      // a tap nor a drag, and releasing does nothing.
      press.held = grab(this.#host.state(), press.hit);
      if (press.held !== null) {
        this.#layer.beginDrag(press.held.cards);
        // A card is off the table and in the air: the piles that would take it
        // are worth showing, and the one it came from is no longer under the
        // cursor to be lifted.
        this.#host.hover([]);
        this.#host.carrying(press.held);
      }
    }

    if (press.held === null) return;

    const elapsed = Math.max(1, event.timeStamp - press.lastT);
    const velocity = (event.clientX - press.lastX) / elapsed;
    press.tilt = clamp(velocity * TILT_PER_VELOCITY, -MAX_TILT, MAX_TILT);
    press.lastX = event.clientX;
    press.lastT = event.timeStamp;

    this.#layer.dragBy(dx, dy, press.tilt);
  };

  #onUp = (event: PointerEvent): void => {
    const press = this.#press;
    if (press === null || press.pointerId !== event.pointerId) return;
    this.#press = null;
    // Where the pointer finished, so the lift can be retaken from here once
    // the move this gesture asked for has repainted the board.
    if (this.#hovers && event.pointerType === "mouse") {
      this.#at = { x: event.clientX, y: event.clientY };
    }

    // A long press is its own gesture: letting go closes the column and does
    // nothing else. Without this, every peek would also play an auto-move.
    const peeked = press.peeked;
    this.#release(press);
    this.#host.carrying(null);
    if (peeked) return;

    if (press.held !== null) {
      this.#drop(
        press,
        event.clientX - press.startX,
        event.clientY - press.startY,
      );
      return;
    }
    if (!press.committed) this.#tap(press);
  };

  #onCancel = (event: PointerEvent): void => {
    const press = this.#press;
    if (press === null || press.pointerId !== event.pointerId) return;
    this.#press = null;
    this.#release(press);
    this.#host.carrying(null);
    if (press.held !== null) this.#layer.returnHome();
  };

  /** Cancel a pending long press, and close the column if one opened. */
  #release(press: Press | null): void {
    if (press === null) return;
    clearTimeout(press.hold);
    press.hold = undefined;
    if (press.peeked) {
      press.peeked = false;
      this.#host.peek(null);
    }
  }

  #tap(press: Press): void {
    const hit = press.hit;
    const move = autoMove(this.#host.state(), hit);
    if (move !== null && this.#host.play(move, "move")) return;
    // What the tap was about: the run it would have carried, or — on a
    // face-down card, which picks nothing up — the card that was pressed.
    const run = grab(this.#host.state(), hit)?.cards;
    this.#host.illegal(run ?? (hit.card === null ? [] : [hit.card]));
  }

  /**
   * The drop target is the pile the *dragged card* overlaps most, not the one
   * under the pointer: with a 46px card and a fingertip, pointer-based
   * targeting is wrong constantly.
   */
  #drop(press: Press, dx: number, dy: number): void {
    const held = press.held as Grab;
    const m = this.#host.metrics();
    const base = this.#layer.placementOf(held.cards[0] as Card);
    if (m === null || base === undefined) {
      this.#layer.returnHome();
      return;
    }

    const onto = dropTarget(m, this.#host.state(), base.x + dx, base.y + dy);
    const move =
      onto === null ? null : dropMove(this.#host.state(), held, onto);

    // Release before the repaint: a held card is the one thing render leaves
    // alone, and by now it is no longer held.
    if (move !== null) {
      this.#layer.endDrag();
      if (this.#host.play(move, "drop")) return;
    }
    this.#layer.returnHome(held.cards);
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
