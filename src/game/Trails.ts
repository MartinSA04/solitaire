import { type Card, SUIT_COUNT, suitOf } from "../engine/index.ts";
import { type Body } from "./cascade.ts";
import { Z_TRAILS } from "./Layout.ts";

/**
 * The comet tails behind the falling cards — the thing the original couldn't
 * do, and the thing that makes the cascade read as ours. See docs/06.
 *
 * The whole mechanism is two operations a frame:
 *
 * 1. Fade everything already on the canvas by a few percent.
 * 2. Paint a soft rounded rect per live card at its current position.
 *
 * Old frames therefore decay exponentially rather than being erased, which
 * leaves a ~20-frame tail and costs exactly one full-canvas operation plus one
 * small fill per card. The fade is free, because it *is* the clear.
 *
 * docs/06 describes step 1 as filling the canvas with the table colour. This
 * does it as `destination-out` instead, which subtracts alpha rather than
 * adding paint: the canvas is transparent over a table that is a gradient in
 * every theme we ship, so fading towards a single flat colour would leave a
 * visible rectangle of not-quite-table over it. Same tail, same cost, and the
 * trails decay into the real table.
 */

/**
 * Per-frame decay. ~5.5% a frame is a tail of roughly twenty frames — long
 * enough to read as a trail, short enough that the screen still clears.
 */
export const FADE_ALPHA = 0.055;

/** Stage 3's wash-out: the same mechanism, four times as fast. */
export const CLEAR_FADE_ALPHA = 0.22;

/** How much brighter Stage 3's single bloom frame is than what is on the canvas. */
const BLOOM_GAIN = 1.2;

/**
 * The trail's opacity per frame — and it has to be very low, because the tail
 * is made of overlap. A card crossing the screen advances about a seventh of
 * its own width per frame, so roughly seven rects stack on any given pixel
 * before the fade has taken them; at 0.5 that composites to opaque and the
 * cascade turns into ribbons with cards on top. A tenth reads as light.
 */
const TRAIL_ALPHA = 0.1;

/**
 * How far the trail colour is mixed from the suit's ink towards the card's
 * face. A card is mostly its face with a little ink on it, so its dominant
 * colour is neither: pure ink makes black suits invisible against a dark
 * table and kills them entirely under the dark theme's `lighter` compositing,
 * and pure face makes all four suits the same colour. Half way, red cards
 * leave warm trails and black cards leave pale ones, and both came from the
 * deck rather than from an accent.
 */
const INK_MIX = 0.55;

/** Past 2 the per-frame fill alone can miss frame budget, and nobody can tell. */
export const MAX_DPR = 2;

export interface TrailArea {
  width: number;
  height: number;
  /** The board's top edge within the canvas: card coordinates are board-relative. */
  originY: number;
  cardW: number;
  cardH: number;
  radius: number;
}

export interface Palette {
  cardBg: string;
  /** Indexed by suit, so a four-colour deck changes the trails with the deck. */
  suits: readonly string[];
}

export class Trails {
  readonly #canvas: HTMLCanvasElement;
  #ctx: CanvasRenderingContext2D | null = null;
  #area: TrailArea | null = null;
  #dpr = 1;
  #colours: string[] = [];
  #additive = false;

  constructor(canvas: HTMLCanvasElement) {
    this.#canvas = canvas;
    canvas.style.zIndex = String(Z_TRAILS);
  }

  /**
   * Size the canvas and work out the four trail colours. Called once at the
   * start of Stage 2 — this is the only place that reads computed style, and
   * it happens before the first physics frame rather than during one.
   */
  begin(area: TrailArea, palette: Palette, dpr: number): void {
    this.#area = area;
    this.#colours = Array.from({ length: SUIT_COUNT }, (_, suit) =>
      mix(palette.suits[suit] ?? "#000", palette.cardBg, INK_MIX, TRAIL_ALPHA),
    );
    this.#ctx = this.#canvas.getContext("2d", { alpha: true });
    this.resize(dpr);
  }

  /** The first rung of the degradation ladder: DPR down to 1. */
  resize(dpr: number): void {
    const area = this.#area;
    const ctx = this.#ctx;
    if (area === null || ctx === null) return;
    this.#dpr = Math.min(MAX_DPR, Math.max(1, dpr));
    this.#canvas.width = Math.ceil(area.width * this.#dpr);
    this.#canvas.height = Math.ceil(area.height * this.#dpr);
    this.#canvas.style.width = `${area.width}px`;
    this.#canvas.style.height = `${area.height}px`;
    ctx.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0);
  }

  /**
   * Whether the dark theme's additive compositing is on. It is what turns a
   * dark table's trails into fireworks, and it is a theme's decision — hence a
   * custom property rather than a flag in here.
   */
  set additive(additive: boolean) {
    this.#additive = additive;
  }

  /** One frame: fade what is there, then paint what is live. */
  frame(bodies: readonly Body[], fadeAlpha: number, paint: boolean): void {
    const ctx = this.#ctx;
    const area = this.#area;
    if (ctx === null || area === null) return;

    if (fadeAlpha > 0) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = `rgb(0 0 0 / ${fadeAlpha})`;
      ctx.fillRect(0, 0, area.width, area.height);
    }
    if (!paint) return;

    ctx.globalCompositeOperation = this.#additive ? "lighter" : "source-over";
    for (const body of bodies) {
      if (!body.alive) continue;
      ctx.fillStyle = this.#colourOf(body.card);
      ctx.beginPath();
      ctx.roundRect(
        body.x,
        body.y + area.originY,
        area.cardW,
        area.cardH,
        area.radius,
      );
      ctx.fill();
    }
  }

  /** Stage 3: everything on the canvas, once, brighter. */
  bloom(): void {
    const ctx = this.#ctx;
    const area = this.#area;
    if (ctx === null || area === null) return;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = BLOOM_GAIN;
    ctx.drawImage(this.#canvas, 0, 0, area.width, area.height);
    ctx.globalAlpha = 1;
  }

  /** The last rung of the ladder, and what skipping does. */
  clear(): void {
    const ctx = this.#ctx;
    const area = this.#area;
    if (ctx === null || area === null) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, area.width, area.height);
  }

  #colourOf(card: Card): string {
    return this.#colours[suitOf(card)] ?? "rgb(255 255 255 / 30%)";
  }
}

/**
 * Blend two CSS colours and give the result an alpha. Hex and `rgb()` are all
 * the theme tokens are ever written in, and anything else falls back rather
 * than throwing — a trail is not worth an exception.
 */
export function mix(
  from: string,
  to: string,
  amount: number,
  alpha: number,
): string {
  const a = parseColour(from);
  const b = parseColour(to);
  if (a === null || b === null) return `rgb(255 255 255 / ${alpha})`;
  const channel = (i: number): number =>
    Math.round(
      (a[i] as number) + ((b[i] as number) - (a[i] as number)) * amount,
    );
  return `rgb(${channel(0)} ${channel(1)} ${channel(2)} / ${alpha})`;
}

export function parseColour(value: string): [number, number, number] | null {
  const text = value.trim();
  const hex = /^#([\da-f]{3,8})$/i.exec(text);
  if (hex !== null) {
    const digits = hex[1] as string;
    if (digits.length === 3 || digits.length === 4) {
      return [0, 1, 2].map((i) =>
        parseInt((digits[i] as string).repeat(2), 16),
      ) as [number, number, number];
    }
    if (digits.length === 6 || digits.length === 8) {
      return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as [
        number,
        number,
        number,
      ];
    }
    return null;
  }
  const numbers = text.match(/-?[\d.]+/g);
  if (!/^rgba?\(/i.test(text) || numbers === null || numbers.length < 3) {
    return null;
  }
  return [0, 1, 2].map((i) => Number(numbers[i])) as [number, number, number];
}
