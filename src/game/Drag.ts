import { type Card, type GameState, type Move } from "../engine/index.ts";
import { type CardLayer, type Motion } from "./CardLayer.ts";
import {
  type Hit,
  type Metrics,
  type Placement,
  dropTarget,
  hitTest,
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
    this.#press = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      hit,
      committed: false,
      held: null,
      lastX: event.clientX,
      lastT: event.timeStamp,
      tilt: 0,
    };
  };

  #onMove = (event: PointerEvent): void => {
    const press = this.#press;
    if (press === null || press.pointerId !== event.pointerId) return;

    const dx = event.clientX - press.startX;
    const dy = event.clientY - press.startY;

    if (!press.committed) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      press.committed = true;
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
    if (press.held !== null) this.#layer.returnHome();
  };

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

    const onto = dropTarget(
      m,
      this.#host.state(),
      (base as Placement).x + dx,
      (base as Placement).y + dy,
    );
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
