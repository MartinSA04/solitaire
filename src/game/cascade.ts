import {
  type Card,
  type Rank,
  DECK_SIZE,
  KING,
  cardOf,
  mulberry32,
} from "../engine/index.ts";
import { FOUNDATION_ORDER, MAX_CARD_W } from "./Layout.ts";

/**
 * Stage 2 of the win sequence, as arithmetic: what leaves the foundations,
 * when, how fast, and when it is gone. See docs/06-win-sequence.md.
 *
 * Pure — no DOM, no timers, no `Math.random`. That is not fastidiousness: the
 * cascade is the one part of the product whose behaviour cannot be eyeballed
 * from a screenshot, so it has to be runnable under `node --test`, and a
 * seeded PRNG is what lets the Playwright suite compare like with like. The
 * DOM side of Stage 2 — writing transforms, painting trails, making noises —
 * is `WinSequence.ts`, `CardLayer.ts`, `Trails.ts` and `Audio.ts`.
 *
 * Coordinates are the card layer's: x and y are a card's top-left corner,
 * measured from the top-left of the board, exactly as {@link Placement} is.
 * Angles are degrees, rotation is 2D only — at 46px a perspective flip reads
 * as flicker rather than depth.
 */

/** px/s². Tuned by eye against the original cascade, not derived from anything. */
const GRAVITY = 1600;

/** Bounce height ≈ 52% of drop height. */
const RESTITUTION = 0.72;

/** Horizontal damping, applied per bounce rather than continuously. */
const FRICTION = 0.98;

/** Spin damping, per bounce. */
const SPIN_DAMPING = 0.94;

/** The toss: a slight upward push before gravity takes it, px/s. */
const LAUNCH_UP_MIN = 120;
const LAUNCH_UP_MAX = 260;

/**
 * Sideways launch speed, px/s **at a 110px card** — the one constant in this
 * file that scales with the board.
 *
 * docs/06 writes every velocity in absolute pixels, which is right for
 * everything that falls: the drop is the height of a screen, and screens are
 * the same order of magnitude everywhere. It is wrong for everything that
 * travels sideways, because the board is *by construction* seven cards and six
 * gaps across — so the distance a card must cover to leave is measured in
 * cards, not pixels. Left absolute, a 46px-card phone throws cards clean off
 * the side before most of them ever reach the floor: simulated over six seeds
 * at 390×844 the whole deck produced 16 bounces, against 131 on a desktop. The
 * cascade's rhythm *is* its bounces, so a phone got a nearly silent one.
 *
 * Expressed per card width the two agree: ~64 bounces on the phone, and the
 * desktop numbers are untouched, because at the maximum card width this
 * multiplier is exactly 1.
 */
const LAUNCH_SIDE_MIN = 180;
const LAUNCH_SIDE_MAX = 420;

/** Spin at launch, °/s. Correlated with vx: a card thrown right spins right. */
const SPIN_MIN = 90;
const SPIN_MAX = 240;

/**
 * How often a card is thrown *away* from the nearest screen edge rather than
 * towards it. A bias, not a rule — an occasional card leaving immediately is
 * what stops 52 launches looking like a machine.
 */
const AWAY_BIAS = 0.75;

/**
 * The launch interval eases from the first gap to the last over the whole
 * deck: it starts measured and ends in a torrent.
 */
const LAUNCH_FIRST_MS = 170;
const LAUNCH_LAST_MS = 70;

/**
 * A card that rebounds slower than this has run out of bounce and slides off
 * rather than shivering on the floor for the rest of the sequence.
 */
const REST_SPEED = 90;

/**
 * Nothing survives longer than this, whatever the physics says. The hard cap
 * is what makes "the sequence cannot stall" a fact rather than a hope.
 */
export const MAX_AGE_S = 6;

/** The fixed simulation step: 1/120s, so a 60Hz phone and a 120Hz one agree. */
export const STEP_S = 1 / 120;

/** The board, as the cascade sees it. The floor is `height`, the sides are open. */
export interface Bounds {
  width: number;
  height: number;
  cardW: number;
  cardH: number;
}

/** One card in flight. Mutable on purpose: 52 of these are stepped 120×/second. */
export interface Body {
  readonly card: Card;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Degrees. */
  angle: number;
  /** Degrees per second. */
  spin: number;
  /** Seconds since launch, against which {@link MAX_AGE_S} is enforced. */
  age: number;
  bounces: number;
  alive: boolean;
}

/** A float in `[0, 1)`. mulberry32 yields uint32, which is what the deal needs. */
export function cascadeRandom(seed: number): () => number {
  const next = mulberry32(seed);
  return () => next() / 0x1_0000_0000;
}

/**
 * The order cards leave in: one at a time from the top of each foundation,
 * cycling ♠→♥→♦→♣, so the four piles deplete evenly rather than one at a time.
 * Kings first, Aces last — which is simply the order they are stacked in.
 */
export function launchOrder(): Card[] {
  const order: Card[] = [];
  for (let rank = KING; rank >= 0; rank--) {
    for (const suit of FOUNDATION_ORDER) {
      order.push(cardOf(suit, rank as Rank));
    }
  }
  return order;
}

/**
 * When each card launches, in milliseconds from the start of Stage 2. The gap
 * shrinks linearly from {@link LAUNCH_FIRST_MS} to {@link LAUNCH_LAST_MS}, so
 * the whole deck is away in a little over six seconds and the last few go in a
 * rush.
 */
export function launchSchedule(count: number = DECK_SIZE): number[] {
  const times: number[] = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    times.push(at);
    const progress = count < 2 ? 1 : i / (count - 1);
    at += LAUNCH_FIRST_MS + (LAUNCH_LAST_MS - LAUNCH_FIRST_MS) * progress;
  }
  return times;
}

/**
 * Throw one card off its foundation. `origin` is the pile's top-left corner —
 * which is where the card already is, since every card is home by now.
 */
export function launch(
  card: Card,
  origin: { x: number; y: number },
  bounds: Bounds,
  random: () => number,
): Body {
  const centre = origin.x + bounds.cardW / 2;
  const awayIsRight = centre < bounds.width / 2;
  const goesAway = random() < AWAY_BIAS;
  const direction = awayIsRight === goesAway ? 1 : -1;
  const across = bounds.cardW / MAX_CARD_W;

  return {
    card,
    x: origin.x,
    y: origin.y,
    vx: direction * between(random, LAUNCH_SIDE_MIN, LAUNCH_SIDE_MAX) * across,
    vy: -between(random, LAUNCH_UP_MIN, LAUNCH_UP_MAX),
    angle: 0,
    spin: direction * between(random, SPIN_MIN, SPIN_MAX),
    age: 0,
    bounces: 0,
    alive: true,
  };
}

function between(random: () => number, low: number, high: number): number {
  return low + random() * (high - low);
}

/**
 * Advance one body by `dt` seconds. Returns the impact speed if it hit the
 * floor this step, so the sound can be generated by the physics rather than
 * scripted alongside it — which is why the music is different every game.
 *
 * Cards bounce off the **bottom edge only**. The sides are open: a card that
 * leaves left or right is gone, which is what keeps the screen clearing and
 * stops 52 cards pinballing forever in a small viewport. Cards never collide
 * with each other — 52-body collision at 120Hz on a cheap phone is not
 * affordable and the eye reads a cascade of independent objects anyway.
 */
export function step(body: Body, dt: number, bounds: Bounds): number | null {
  body.age += dt;
  body.vy += GRAVITY * dt;
  body.x += body.vx * dt;
  body.y += body.vy * dt;
  body.angle += body.spin * dt;

  let impact: number | null = null;
  const floor = bounds.height - bounds.cardH;
  if (body.y >= floor && body.vy > 0) {
    impact = body.vy;
    body.y = floor;
    body.vy = -impact * RESTITUTION;
    body.vx *= FRICTION;
    body.spin *= SPIN_DAMPING;
    body.bounces += 1;
    // Out of bounce: it stops hopping and slides off rather than shivering.
    if (impact * RESTITUTION < REST_SPEED) body.alive = false;
  }

  if (body.age > MAX_AGE_S || hasLeft(body, bounds)) body.alive = false;
  return impact;
}

/** Fully off-screen *and* moving away — a card on its way back in is not gone. */
function hasLeft(body: Body, bounds: Bounds): boolean {
  return (
    (body.x + bounds.cardW < 0 && body.vx <= 0) ||
    (body.x > bounds.width && body.vx >= 0)
  );
}
