import { type Card, DECK_SIZE, suitOf } from "../engine/index.ts";
import { WinAudio } from "./Audio.ts";
import { type CardLayer } from "./CardLayer.ts";
import { pileOrigin } from "./Layout.ts";
import {
  type Palette,
  CLEAR_FADE_ALPHA,
  FADE_ALPHA,
  MAX_DPR,
  Trails,
} from "./Trails.ts";
import {
  type Body,
  type Bounds,
  STEP_S,
  cascadeRandom,
  launch,
  launchOrder,
  launchSchedule,
  step,
} from "./cascade.ts";

/**
 * The win sequence: the reason to build this site. docs/06-win-sequence.md is
 * the specification and this file is the whole of the implementation of its
 * timeline — the visuals of Stages 1 and 3 are CSS (`src/styles/win.css`), the
 * physics is `cascade.ts`, the trails are `Trails.ts`, the sound is
 * `Audio.ts`, and Stage 4 is a Svelte panel.
 *
 * Two rules constrain everything here:
 *
 * 1. **It is always skippable.** {@link skip} works at any moment.
 * 2. **It never blocks the next game.** Reaching Stage 4 is the only thing the
 *    rest of the app waits for, and skipping gets there in ~300ms.
 */

/** Which stage is on screen. The chrome renders from this; CSS keys off it. */
export type WinStage =
  "none" | "beat" | "ascend" | "cascade" | "clear" | "card";

/**
 * Stage 0. The most important 140ms in the product: every celebration that
 * feels cheap starts *instantly*, which reads as a canned response rather than
 * a reaction.
 */
const BEAT_MS = 140;

/** Stage 1. Also the window in which `will-change` on 52 elements is absorbed. */
const ASCEND_MS = 860;

/**
 * Foundations pulse ♠ ♥ ♦ ♣ at this interval, and the arpeggio keeps time with
 * them. Exported because the board's four foundation slots bloom on the same
 * stagger, and a template that hard-coded 90 would drift from this one.
 */
export const PULSE_GAP_MS = 90;

/** Stage 3. */
const CLEAR_MS = 600;

/** The reduced-motion Stage 2: the piles fade while the bloom fills the table. */
const DISSOLVE_MS = 900;

/** Skipping fades the canvas rather than cutting it. */
const SKIP_FADE_MS = 180;

/**
 * The most simulation one frame may catch up on. Past this we let the
 * animation run slow rather than spiral: a tab that was backgrounded for two
 * seconds must not try to step 240 frames at once.
 */
const MAX_FRAME_S = 0.05;

/** In deterministic mode every frame is exactly this much simulation. */
const FIXED_STEPS_PER_FRAME = 2;

/**
 * What counts as a dropped frame, in milliseconds.
 *
 * Not 16.7. A healthy 60Hz frame *is* 16.7ms, and measured rAF deltas sit a
 * hair either side of it — on a headless Chromium hitting 60fps exactly,
 * a third of frames measured 16.8ms, which was enough to walk the ladder below
 * all the way down to "no trails" in two seconds on hardware that had not
 * dropped anything at all. A frame that genuinely missed has waited for the
 * *next* vsync, so it lands near 33ms; 25 sits between the two and is
 * unambiguous on a 120Hz display as well, where we still only want 60.
 */
const FRAME_DROPPED_MS = 25;

/** How often the loop reconsiders whether it is keeping up. */
const DEGRADE_WINDOW_MS = 500;

/**
 * Missing this share of a window's frames costs one rung of the ladder.
 *
 * A quarter is deliberately late. Under Chromium's CPU throttling the ladder
 * turns out to change measured frame times by nothing at all — at 2×, 4× and
 * 6× the percentiles are the same whether it fires or not — because the cost
 * that throttling models is main-thread work for 52 composited elements, and
 * the ladder's rungs are all canvas work. The rungs address memory bandwidth
 * on a cheap GPU, which is a real cost on the target device and one no harness
 * we have can simulate. So it stays, and it triggers late: at a tenth it fired
 * on a machine holding a 60fps median with occasional hitches, and stripped
 * the trails to buy nothing.
 */
const DEGRADE_THRESHOLD = 0.25;

/**
 * The graceful-degradation ladder from docs/06, in order. It never goes below
 * "cards fall and bounce at 60fps", because that is the part that matters.
 */
const DEGRADE_DPR = 1;
const DEGRADE_HALF_FILL = 2;
const DEGRADE_SLOW_LAUNCH = 3;
const DEGRADE_NO_TRAILS = 4;

/** How much rung 3 lengthens the launch interval, so fewer cards are live at once. */
const LAUNCH_STRETCH = 1.4;

export interface WinOptions {
  layer: CardLayer;
  canvas: HTMLCanvasElement;
  /** The board, for its position and for the theme's computed colours. */
  board: HTMLElement;
  /**
   * Deterministic mode: seeds the physics and fixes the timestep, so the
   * Playwright suite compares like with like. `null` is a real game.
   */
  seed: number | null;
  reducedMotion: boolean;
  muted: boolean;
  /** The visible card on each foundation, ♠ ♥ ♦ ♣, for Stage 1's pulses. */
  foundationTops: () => readonly (Card | null)[];
  onStage: (stage: WinStage) => void;
}

export class WinSequence {
  readonly #options: WinOptions;
  readonly #audio: WinAudio;
  readonly #trails: Trails;

  #stage: WinStage = "none";
  #timers: ReturnType<typeof setTimeout>[] = [];
  #frame: number | null = null;

  #bounds: Bounds | null = null;
  /** Fixed for the life of the sequence, and pure: worked out once, up front. */
  readonly #order: Card[] = launchOrder();
  readonly #schedule: number[] = launchSchedule(DECK_SIZE);
  #bodies: Body[] = [];
  #launched = 0;
  #random: () => number = Math.random;

  #simMs = 0;
  #last = 0;
  #accumulator = 0;

  #level = 0;
  #windowFrom = 0;
  #windowFrames = 0;
  #windowSlow = 0;
  #launchStretch = 1;

  constructor(options: WinOptions) {
    this.#options = options;
    this.#audio = new WinAudio(options.muted);
    this.#trails = new Trails(options.canvas);
  }

  get stage(): WinStage {
    return this.#stage;
  }

  /**
   * Called from the move that won the game — which is also the user gesture
   * the browser's autoplay policy wants, and the only reason there can be any
   * sound at all.
   */
  start(): void {
    if (this.#stage !== "none") return;
    this.#audio.start();
    this.#enter("beat");
    this.#after(BEAT_MS, () => this.#ascend());
  }

  /**
   * A tap anywhere during Stages 1–3. It must feel like a choice, not like an
   * interruption being punished: ~300ms to the panel, with the canvas fading
   * and the voices releasing rather than either being cut off.
   */
  skip(): void {
    if (this.#stage === "none" || this.#stage === "card") return;
    this.#stopLoop();
    this.#clearTimers();
    this.#audio.release();

    for (const body of this.#bodies) body.alive = false;
    for (let card = 0; card < DECK_SIZE; card++) {
      this.#options.layer.hide(card);
    }
    this.#options.layer.settle();

    this.#options.canvas.classList.add("is-fading");
    this.#after(SKIP_FADE_MS, () => {
      this.#trails.clear();
      this.#options.canvas.classList.remove("is-fading");
    });
    this.#enter("card");
  }

  destroy(): void {
    this.#stopLoop();
    this.#clearTimers();
    this.#audio.close();
  }

  // ------------------------------------------------------------- stage 1

  /**
   * Ascension: the board acknowledges what happened before it destroys itself.
   * The pulses, the light sweep and the chrome fade are all CSS keyed off the
   * stage; what has to happen in here is taking the cards off transitions and
   * putting the arpeggio in time with the pulses.
   */
  #ascend(): void {
    this.#enter("ascend");
    this.#options.layer.surrender();
    this.#audio.arpeggio();

    // The four foundation tops pulse ♠ ♥ ♦ ♣ in turn. Under the debug trigger
    // a foundation may be empty, in which case its slot blooms alone.
    this.#options.foundationTops().forEach((card, i) => {
      if (card !== null) this.#options.layer.pulse(card, i * PULSE_GAP_MS);
    });

    this.#after(ASCEND_MS, () =>
      this.#options.reducedMotion ? this.#dissolve() : this.#cascade(),
    );
  }

  // ------------------------------------------------------------- stage 2

  #cascade(): void {
    const m = this.#options.layer.metrics;
    if (m === null) {
      // No geometry means no board to throw cards across. Skip to the panel
      // rather than inventing one.
      this.#enter("card");
      return;
    }

    const rect = this.#options.board.getBoundingClientRect();
    // The floor is the bottom of the *screen*, not the bottom of the board:
    // the chrome has faded out by now and a card bouncing off an invisible bar
    // would look like it had hit nothing.
    this.#bounds = {
      width: rect.width,
      height: window.innerHeight - rect.top,
      cardW: m.cardW,
      cardH: m.cardH,
    };

    const style = getComputedStyle(this.#options.board);
    const palette: Palette = {
      cardBg: style.getPropertyValue("--card-bg"),
      // Suit order is the card numbering's: ♣ ♦ ♥ ♠.
      suits: [
        style.getPropertyValue("--suit-clubs"),
        style.getPropertyValue("--suit-diamonds"),
        style.getPropertyValue("--suit-hearts"),
        style.getPropertyValue("--suit-spades"),
      ],
    };
    this.#trails.begin(
      {
        width: window.innerWidth,
        height: window.innerHeight,
        originY: rect.top,
        cardW: m.cardW,
        cardH: m.cardH,
        radius: m.radius,
      },
      palette,
      Math.min(MAX_DPR, window.devicePixelRatio || 1),
    );
    this.#trails.additive =
      style.getPropertyValue("--win-trail-blend").trim() === "lighter";

    this.#random = cascadeRandom(this.#options.seed ?? randomSeed());
    this.#bodies = [];
    this.#launched = 0;
    this.#simMs = 0;
    this.#accumulator = 0;
    this.#level = 0;
    this.#launchStretch = 1;

    this.#enter("cascade");
    this.#startLoop();
  }

  #startLoop(): void {
    this.#last = performance.now();
    this.#windowFrom = this.#last;
    this.#windowFrames = 0;
    this.#windowSlow = 0;
    this.#frame = requestAnimationFrame(this.#tick);
  }

  #stopLoop(): void {
    if (this.#frame !== null) cancelAnimationFrame(this.#frame);
    this.#frame = null;
  }

  #tick = (now: number): void => {
    const elapsed = now - this.#last;
    this.#last = now;
    this.#measure(now, elapsed);

    if (this.#options.seed !== null) {
      // Deterministic: every frame is the same amount of simulation, so two
      // runs of the same seed produce the same cascade whatever the machine
      // was doing at the time.
      for (let i = 0; i < FIXED_STEPS_PER_FRAME; i++) this.#advance(STEP_S);
    } else {
      this.#accumulator += Math.min(MAX_FRAME_S, elapsed / 1000);
      while (this.#accumulator >= STEP_S) {
        this.#advance(STEP_S);
        this.#accumulator -= STEP_S;
      }
    }

    this.#paint();

    if (this.#launched >= this.#order.length && !this.#bodies.some(alive)) {
      this.#stopLoop();
      this.#clear();
      return;
    }
    this.#frame = requestAnimationFrame(this.#tick);
  };

  /** One fixed physics step, plus the launches and the sounds it produced. */
  #advance(dt: number): void {
    const bounds = this.#bounds;
    if (bounds === null) return;
    this.#simMs += dt * 1000;

    const m = this.#options.layer.metrics;
    while (
      this.#launched < this.#order.length &&
      (this.#schedule[this.#launched] as number) * this.#launchStretch <=
        this.#simMs &&
      m !== null
    ) {
      const card = this.#order[this.#launched] as Card;
      const origin = pileOrigin(m, { pile: "foundation", suit: suitOf(card) });
      this.#bodies.push(launch(card, origin, bounds, this.#random));
      this.#launched += 1;
    }

    const progress = this.#launched / this.#order.length;
    for (const body of this.#bodies) {
      if (!body.alive) continue;
      const impact = step(body, dt, bounds);
      if (impact !== null) this.#audio.bounce(impact, progress, body.bounces);
      if (!body.alive) this.#options.layer.hide(body.card);
    }
  }

  /** One rendered frame: 52 transforms at most, and one pass over the canvas. */
  #paint(): void {
    for (const body of this.#bodies) {
      if (!body.alive) continue;
      this.#options.layer.fly(body.card, body.x, body.y, body.angle);
    }
    if (this.#level >= DEGRADE_NO_TRAILS) return;

    const halved = this.#level >= DEGRADE_HALF_FILL;
    // Half the fills, twice the alpha: the same decay, half the full-canvas work.
    const paintThisFrame = !halved || this.#windowFrames % 2 === 0;
    this.#trails.frame(
      this.#bodies,
      paintThisFrame ? FADE_ALPHA * (halved ? 2 : 1) : 0,
      true,
    );
  }

  /**
   * The loop measures itself: docs/06's ladder, one rung per window that
   * misses budget. It only ever drops the trails and the launch rate, never
   * the physics, because cards falling at 60fps is the part that matters.
   */
  #measure(now: number, elapsed: number): void {
    this.#windowFrames += 1;
    if (elapsed > FRAME_DROPPED_MS) this.#windowSlow += 1;
    if (now - this.#windowFrom < DEGRADE_WINDOW_MS) return;

    const missed = this.#windowSlow / Math.max(1, this.#windowFrames);
    this.#windowFrom = now;
    this.#windowFrames = 0;
    this.#windowSlow = 0;
    if (missed <= DEGRADE_THRESHOLD || this.#level >= DEGRADE_NO_TRAILS) return;

    this.#level += 1;
    if (this.#level === DEGRADE_DPR) this.#trails.resize(1);
    if (this.#level === DEGRADE_SLOW_LAUNCH)
      this.#launchStretch = LAUNCH_STRETCH;
    if (this.#level === DEGRADE_NO_TRAILS) this.#trails.clear();
  }

  // ------------------------------------------- stage 2, reduced motion

  /**
   * The designed alternative, not an absence: the four piles fade out while
   * the bloom expands behind them to fill the table. Winning is the payoff,
   * and removing it entirely punishes the player for a system setting.
   */
  #dissolve(): void {
    this.#enter("cascade");
    // Only the four visible cards fade. The twelve underneath each of them are
    // at the same coordinates, so fading the pile as a whole would composite
    // thirteen half-transparent kings, queens and jacks into one smeared card.
    const visible = new Set(this.#options.foundationTops());
    for (let card = 0; card < DECK_SIZE; card++) {
      this.#options.layer.hide(card, visible.has(card));
    }
    this.#after(DISSOLVE_MS, () => {
      // Stage 3 is skipped here, but the arpeggio still frames it: reduced
      // motion is not reduced sound.
      this.#audio.arpeggio(true);
      this.#options.layer.settle();
      this.#enter("card");
    });
  }

  // ------------------------------------------------------------- stage 3

  #clear(): void {
    this.#enter("clear");
    this.#options.layer.settle();
    this.#audio.arpeggio(true);
    this.#trails.bloom();
    this.#washOut();
    this.#after(CLEAR_MS, () => this.#enter("card"));
  }

  /** The trails wash out on the same mechanism that drew them, four times as fast. */
  #washOut(): void {
    const from = performance.now();
    const fade = (): void => {
      if (this.#stage !== "clear") return;
      this.#trails.frame([], CLEAR_FADE_ALPHA, false);
      if (performance.now() - from < CLEAR_MS) {
        this.#frame = requestAnimationFrame(fade);
        return;
      }
      this.#trails.clear();
      this.#frame = null;
    };
    this.#frame = requestAnimationFrame(fade);
  }

  // -------------------------------------------------------------- plumbing

  #enter(stage: WinStage): void {
    this.#stage = stage;
    this.#options.onStage(stage);
  }

  #after(ms: number, run: () => void): void {
    this.#timers.push(setTimeout(run, ms));
  }

  #clearTimers(): void {
    for (const timer of this.#timers) clearTimeout(timer);
    this.#timers = [];
  }
}

function alive(body: Body): boolean {
  return body.alive;
}

/**
 * A different cascade every game. Nothing here is shared, replayed or saved,
 * so unlike the deal this seed is genuinely disposable.
 */
function randomSeed(): number {
  return (Math.random() * 0x1_0000_0000) >>> 0;
}
