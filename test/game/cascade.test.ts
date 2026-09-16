import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type Card,
  DECK_SIZE,
  KING,
  cardName,
  rankOf,
  suitOf,
} from "../../src/engine/index.ts";
import {
  FOUNDATION_ORDER,
  metricsFor,
  pileOrigin,
} from "../../src/game/Layout.ts";
import {
  type Body,
  type Bounds,
  MAX_AGE_S,
  STEP_S,
  cascadeRandom,
  launch,
  launchOrder,
  launchSchedule,
  step,
} from "../../src/game/cascade.ts";

/**
 * The cascade is the one part of the UI that cannot be judged from a
 * screenshot: it is eleven seconds of continuous motion that is different
 * every time. All of it that is arithmetic lives in `cascade.ts` and is pinned
 * here, against docs/06-win-sequence.md.
 *
 * The properties that matter are not the constants — those are taste — but the
 * guarantees: the sequence always ends, the screen always clears, and the same
 * seed always produces the same cascade.
 */

/** A 390×844 phone with the two bars taken off, and the floor at the screen's bottom. */
const PHONE = phoneBoard();

function phoneBoard(): {
  bounds: Bounds;
  metrics: ReturnType<typeof metricsFor>;
} {
  const metrics = metricsFor({ width: 390, height: 844 - 44 - 56 });
  return {
    metrics,
    bounds: {
      width: 390,
      height: 844 - 44,
      cardW: metrics.cardW,
      cardH: metrics.cardH,
    },
  };
}

/** Run a whole cascade at the fixed timestep and report what happened. */
function runCascade(
  seed: number,
  bounds: Bounds = PHONE.bounds,
  metrics = PHONE.metrics,
) {
  const order = launchOrder();
  const schedule = launchSchedule(order.length);
  const random = cascadeRandom(seed);
  const bodies: Body[] = [];
  const impacts: number[] = [];

  let simMs = 0;
  let launched = 0;
  let liveHigh = 0;
  while (launched < order.length || bodies.some((b) => b.alive)) {
    while (launched < order.length && (schedule[launched] as number) <= simMs) {
      const card = order[launched] as Card;
      const origin = pileOrigin(metrics, {
        pile: "foundation",
        suit: suitOf(card),
      });
      bodies.push(launch(card, origin, bounds, random));
      launched += 1;
    }
    for (const body of bodies) {
      if (!body.alive) continue;
      const impact = step(body, STEP_S, bounds);
      if (impact !== null) impacts.push(impact);
    }
    liveHigh = Math.max(liveHigh, bodies.filter((b) => b.alive).length);
    simMs += STEP_S * 1000;

    assert.ok(simMs < 60_000, "the cascade never ended");
  }
  return { seconds: simMs / 1000, bodies, impacts, liveHigh };
}

describe("the launch order", () => {
  it("cycles ♠ ♥ ♦ ♣, kings first and aces last", () => {
    const order = launchOrder();
    assert.equal(order.length, DECK_SIZE);
    assert.deepEqual(order.slice(0, 4).map(cardName), ["K♠", "K♥", "K♦", "K♣"]);
    assert.deepEqual(order.slice(-4).map(cardName), ["A♠", "A♥", "A♦", "A♣"]);
  });

  it("empties the four piles evenly, which is the whole point of cycling", () => {
    // After every group of four, each foundation has given up the same number.
    const order = launchOrder();
    const given = new Map(FOUNDATION_ORDER.map((suit) => [suit, 0]));
    order.forEach((card, i) => {
      given.set(suitOf(card), (given.get(suitOf(card)) as number) + 1);
      if (i % 4 === 3) {
        assert.equal(new Set(given.values()).size, 1, `uneven after ${i + 1}`);
      }
    });
  });

  it("takes each pile from the top down, so the card leaving is the visible one", () => {
    const seen = new Map<number, number>();
    for (const card of launchOrder()) {
      const previous = seen.get(suitOf(card)) ?? KING + 1;
      assert.equal(rankOf(card), previous - 1);
      seen.set(suitOf(card), rankOf(card));
    }
  });

  it("is the whole deck, once", () => {
    assert.equal(new Set(launchOrder()).size, DECK_SIZE);
  });
});

describe("the launch schedule", () => {
  const schedule = launchSchedule();

  it("starts measured and ends in a torrent", () => {
    const gaps = schedule.slice(1).map((at, i) => at - (schedule[i] as number));
    assert.equal(Math.round(gaps[0] as number), 170);
    // The ramp reaches 70ms at the 52nd card, and there is no 53rd to wait
    // for — so the last gap the deck actually contains lands just short of it.
    assert.ok(Math.abs((gaps[gaps.length - 1] as number) - 70) < 3);
    for (const [i, gap] of gaps.slice(1).entries()) {
      assert.ok(gap < (gaps[i] as number), `gap ${i + 1} did not shorten`);
    }
  });

  it("gets the whole deck away inside Stage 2", () => {
    const last = schedule[schedule.length - 1] as number;
    assert.ok(last > 5_000 && last < 7_000, `last launch at ${last}ms`);
  });

  it("is the same every game — it is a schedule, not a shuffle", () => {
    assert.deepEqual(launchSchedule(), schedule);
  });
});

describe("the physics", () => {
  it("bounces off the floor at the stated restitution and nothing else", () => {
    const bounds: Bounds = { width: 400, height: 800, cardW: 50, cardH: 70 };
    const body = launch(0, { x: 175, y: 0 }, bounds, () => 0.5);
    body.vx = 0;
    body.vy = 0;

    let impact: number | null = null;
    while (impact === null && body.age < MAX_AGE_S) {
      impact = step(body, STEP_S, bounds);
    }
    assert.ok(impact !== null, "it never reached the floor");
    // Bounce height ≈ 52% of drop height, which is 0.72 squared.
    assert.ok(Math.abs(-body.vy / (impact as number) - 0.72) < 0.001);
    assert.equal(body.bounces, 1);
    assert.equal(body.y, bounds.height - bounds.cardH);
  });

  it("lets a card leave sideways, and keeps one that is coming back", () => {
    const bounds: Bounds = { width: 400, height: 800, cardW: 50, cardH: 70 };
    const leaving: Body = {
      card: 0,
      x: -60,
      y: 100,
      vx: -200,
      vy: 0,
      angle: 0,
      spin: 0,
      age: 0,
      bounces: 0,
      alive: true,
    };
    const returning: Body = { ...leaving, vx: 200 };

    step(leaving, STEP_S, bounds);
    step(returning, STEP_S, bounds);
    assert.equal(leaving.alive, false, "a card off-screen and going is gone");
    assert.equal(returning.alive, true, "a card on its way back in is not");
  });

  it("throws cards away from the nearest edge, so they cross the board", () => {
    const bounds: Bounds = { width: 400, height: 800, cardW: 50, cardH: 70 };
    // random() = 0 is inside the 0.75 "away" bias, whichever side we are on.
    const fromLeft = launch(0, { x: 10, y: 0 }, bounds, () => 0);
    const fromRight = launch(0, { x: 340, y: 0 }, bounds, () => 0);
    assert.ok(fromLeft.vx > 0, "a card near the left edge goes right");
    assert.ok(fromRight.vx < 0, "a card near the right edge goes left");
    // Spin is correlated with vx: a card thrown right spins right.
    assert.ok(fromLeft.spin > 0 && fromRight.spin < 0);
  });

  it("force-culls anything still alive after six seconds", () => {
    const bounds: Bounds = { width: 400, height: 800, cardW: 50, cardH: 70 };
    // A card that never moves sideways and never loses energy would otherwise
    // bounce for ever. The hard cap is what makes "it cannot stall" a fact.
    const body: Body = {
      card: 0,
      x: 175,
      y: 0,
      vx: 0,
      vy: 0,
      angle: 0,
      spin: 0,
      age: MAX_AGE_S - STEP_S / 2,
      bounces: 0,
      alive: true,
    };
    step(body, STEP_S, bounds);
    assert.equal(body.alive, false);
  });
});

describe("a whole cascade", () => {
  it("clears the screen, every seed", () => {
    for (const seed of [1, 2, 3, 42, 1_000, 4_294_967_295]) {
      const { seconds, bodies } = runCascade(seed);
      assert.equal(bodies.length, DECK_SIZE, `seed ${seed} lost cards`);
      assert.ok(
        bodies.every((body) => !body.alive),
        `seed ${seed} left cards on screen`,
      );
      // Stage 2 is ~11s in docs/06; the last launch is at ~6.2s and nothing
      // outlives it by more than the six-second cap.
      assert.ok(
        seconds > 7 && seconds < 13,
        `seed ${seed} cascaded for ${seconds.toFixed(1)}s`,
      );
    }
  });

  it("is the same cascade for the same seed, and a different one otherwise", () => {
    const a = runCascade(7);
    const b = runCascade(7);
    const c = runCascade(8);
    assert.deepEqual(a.bodies, b.bodies);
    assert.notDeepEqual(a.bodies, c.bodies);
  });

  /**
   * The rhythm is generated by the physics, so this is really a test about the
   * sound: too few bounces and the cascade is silent. Scaling the launch speed
   * by card width is what makes a phone sound like a desktop — see the note on
   * LAUNCH_SIDE_MIN.
   */
  it("bounces enough to make music, on a phone as well as a desktop", () => {
    const phone = runCascade(7);
    const desktop = (() => {
      const metrics = metricsFor({ width: 1440, height: 800 });
      return runCascade(
        7,
        {
          width: 1440,
          height: 856,
          cardW: metrics.cardW,
          cardH: metrics.cardH,
        },
        metrics,
      );
    })();

    assert.ok(
      phone.impacts.length > 30,
      `phone: ${phone.impacts.length} bounces`,
    );
    assert.ok(
      desktop.impacts.length > 30,
      `desktop: ${desktop.impacts.length} bounces`,
    );
  });

  /**
   * The performance-relevant number: how many cards the physics loop and the
   * trail canvas are ever handling at once. Fifty-two is the deck; a third of
   * it is what the launch interval actually keeps in the air.
   */
  it("never has more than half the deck live at once", () => {
    for (const seed of [1, 7, 99]) {
      const { liveHigh } = runCascade(seed);
      assert.ok(liveHigh <= DECK_SIZE / 2, `${liveHigh} cards live at once`);
    }
  });
});
