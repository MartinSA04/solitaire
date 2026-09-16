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
  /** A gesture that meant something but could not happen. */
  illegal(card: Card | null): void;
  /** Fan a column out under a long press, or let it back down with `null`. */
  peek(column: number | null): void;
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

export class Drag {
  readonly #target: HTMLElement;
  readonly #layer: CardLayer;
  readonly #host: DragHost;
  #press: Press | null = null;

  constructor(target: HTMLElement, layer: CardLayer, host: DragHost) {
    this.#target = target;
    this.#layer = layer;
    this.#host = host;
    target.addEventListener("pointerdown", this.#onDown);
    target.addEventListener("pointermove", this.#onMove);
    target.addEventListener("pointerup", this.#onUp);
    target.addEventListener("pointercancel", this.#onCancel);
  }

  destroy(): void {
    this.#target.removeEventListener("pointerdown", this.#onDown);
    this.#target.removeEventListener("pointermove", this.#onMove);
    this.#target.removeEventListener("pointerup", this.#onUp);
    this.#target.removeEventListener("pointercancel", this.#onCancel);
    this.#release(this.#press);
    this.#press = null;
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
    if (press === null || press.pointerId !== event.pointerId) return;

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
      if (press.held !== null) this.#layer.beginDrag(press.held.cards);
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

    // A long press is its own gesture: letting go closes the column and does
    // nothing else. Without this, every peek would also play an auto-move.
    const peeked = press.peeked;
    this.#release(press);
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
    this.#host.illegal(hit.card);
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
