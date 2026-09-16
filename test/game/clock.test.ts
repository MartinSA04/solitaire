import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Stopwatch, formatClock } from "../../src/game/clock.ts";

describe("the clock display", () => {
  it("is m:ss, and h:mm:ss past an hour", () => {
    assert.equal(formatClock(0), "0:00");
    assert.equal(formatClock(950), "0:00");
    assert.equal(formatClock(61_000), "1:01");
    assert.equal(formatClock(14 * 60_000 + 2_000), "14:02");
    assert.equal(formatClock(3_600_000), "1:00:00");
    assert.equal(formatClock(3_600_000 + 61_000), "1:01:01");
  });

  it("never shows a negative time", () => {
    assert.equal(formatClock(-5_000), "0:00");
  });
});

describe("the stopwatch", () => {
  function fake() {
    let now = 0;
    const clock = new Stopwatch(() => now);
    return { clock, advance: (ms: number) => (now += ms) };
  }

  it("does not run until the first move", () => {
    const { clock, advance } = fake();
    advance(5_000);
    assert.equal(clock.elapsed, 0);
    assert.equal(clock.started, false);
  });

  it("counts from the first move", () => {
    const { clock, advance } = fake();
    clock.start();
    advance(3_000);
    assert.equal(clock.elapsed, 3_000);
  });

  it("does not lose time to a second start", () => {
    const { clock, advance } = fake();
    clock.start();
    advance(3_000);
    clock.start();
    advance(1_000);
    assert.equal(clock.elapsed, 4_000);
  });

  it("stops while the tab is hidden and picks up where it left off", () => {
    const { clock, advance } = fake();
    clock.start();
    advance(10_000);
    clock.pause();
    advance(600_000);
    assert.equal(clock.elapsed, 10_000);
    clock.resume();
    advance(2_000);
    assert.equal(clock.elapsed, 12_000);
  });

  it("will not resume a game that never started", () => {
    const { clock, advance } = fake();
    clock.resume();
    advance(4_000);
    assert.equal(clock.elapsed, 0);
  });

  it("resets to nothing for a new deal", () => {
    const { clock, advance } = fake();
    clock.start();
    advance(9_000);
    clock.reset();
    advance(1_000);
    assert.equal(clock.elapsed, 0);
    assert.equal(clock.started, false);
  });
});
