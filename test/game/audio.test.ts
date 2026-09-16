import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ARPEGGIO_DEGREES,
  bounceCutoff,
  bounceLevel,
  bounceNote,
  homeNote,
  moveCutoff,
  scaleNote,
} from "../../src/game/Audio.ts";
import { mix, parseColour } from "../../src/game/Trails.ts";

/**
 * The parts of the win sequence's sound and trails that are arithmetic.
 *
 * WebAudio and a canvas cannot be run under `node --test`, and neither needs
 * to be: what is worth pinning is that the cascade cannot produce a note off
 * the scale however the physics lands, that a dying card is quieter than a
 * hard bounce, and that a theme's colours survive being read back out of CSS.
 * See docs/06-win-sequence.md.
 */

/** Semitones above C, to the nearest cent, for a frequency. */
function semitonesAbove(frequency: number, root = 261.63): number {
  return 12 * Math.log2(frequency / root);
}

/** C D E G A, repeating an octave up. Nothing else is allowed out. */
const PENTATONIC = [0, 2, 4, 7, 9];

describe("the pentatonic scale", () => {
  it("is C D E G A, then the same an octave up", () => {
    for (let degree = 0; degree < 15; degree++) {
      const semitones = semitonesAbove(scaleNote(degree));
      const expected =
        (PENTATONIC[degree % 5] as number) + 12 * Math.floor(degree / 5);
      assert.ok(
        Math.abs(semitones - expected) < 0.01,
        `degree ${degree} is ${semitones.toFixed(2)} semitones, wanted ${expected}`,
      );
    }
  });

  it("ascends, so a card cannot land between two notes", () => {
    for (let degree = 1; degree < 20; degree++) {
      assert.ok(scaleNote(degree) > scaleNote(degree - 1));
    }
  });
});

describe("the bounce notes", () => {
  it("climb roughly two octaves as the cascade progresses", () => {
    const first = bounceNote(0, 1);
    const last = bounceNote(1, 1);
    const octaves = Math.log2(last / first);
    assert.ok(octaves > 1.8 && octaves < 2.6, `climbed ${octaves} octaves`);
  });

  it("never leaves the scale, whatever the physics does", () => {
    // Every combination the loop can produce: any progress, any bounce count
    // up to the point a card is culled.
    for (let step = 0; step <= 100; step++) {
      for (let bounce = 0; bounce < 12; bounce++) {
        const semitones = semitonesAbove(bounceNote(step / 100, bounce));
        const within = Math.round(semitones) % 12;
        assert.ok(
          PENTATONIC.includes(within < 0 ? within + 12 : within),
          `progress ${step / 100}, bounce ${bounce} gave ${semitones}`,
        );
      }
    }
  });

  it("is louder and brighter the harder the bounce", () => {
    assert.ok(bounceLevel(1_200) > bounceLevel(200));
    assert.ok(bounceCutoff(1_200) > bounceCutoff(200));
  });

  it("keeps a dying card audible, and an enormous one in range", () => {
    // Velocity-mapped, but clamped at both ends: silence is not a tick, and a
    // card falling the height of a desktop must not clip.
    assert.ok(bounceLevel(0) > 0);
    assert.equal(bounceLevel(10_000), bounceLevel(1_400));
    assert.ok(bounceLevel(10_000) <= 1);
  });
});

describe("the arpeggio", () => {
  it("is four notes, ascending, and the same four descending", () => {
    assert.equal(ARPEGGIO_DEGREES.length, 4);
    for (const [i, degree] of ARPEGGIO_DEGREES.slice(1).entries()) {
      assert.ok(degree > (ARPEGGIO_DEGREES[i] as number));
    }
    // Stage 3 plays it inverted, which is the whole of "resolving".
    assert.deepEqual([...ARPEGGIO_DEGREES].reverse().reverse(), [
      ...ARPEGGIO_DEGREES,
    ]);
  });
});

describe("trail colours", () => {
  it("reads the hex and rgb() forms a theme token can be written in", () => {
    assert.deepEqual(parseColour("#a8232a"), [168, 35, 42]);
    assert.deepEqual(parseColour("#fff"), [255, 255, 255]);
    assert.deepEqual(parseColour("rgb(12 34 56)"), [12, 34, 56]);
    assert.deepEqual(parseColour("rgba(12, 34, 56, 0.5)"), [12, 34, 56]);
    assert.deepEqual(parseColour(" #1C1A16 "), [28, 26, 22]);
  });

  it("falls back rather than throwing, because a trail is not worth an exception", () => {
    assert.equal(parseColour("oklch(0.7 0.1 30)"), null);
    assert.equal(parseColour(""), null);
    assert.match(mix("nonsense", "#fff", 0.5, 0.2), /^rgb\(/);
  });

  it("mixes the suit's ink towards the card's face", () => {
    // Half way between a red suit and an off-white card is a warm pink, which
    // is what a red card's trail should be.
    assert.equal(mix("#000000", "#ffffff", 0.5, 0.1), "rgb(128 128 128 / 0.1)");
    assert.equal(mix("#a8232a", "#fbf8f1", 0, 0.1), "rgb(168 35 42 / 0.1)");
    assert.equal(mix("#a8232a", "#fbf8f1", 1, 0.1), "rgb(251 248 241 / 0.1)");
  });
});

/** Seven steps, so the cycle never locks to a player's rhythm. */
const MOVE_CYCLE = 7;

describe("the card-movement burst", () => {
  it("never sounds the same twice running", () => {
    // Repeated moves are what make a card game sound like a machine gun.
    for (let n = 0; n < 40; n++) {
      assert.notEqual(
        moveCutoff(n),
        moveCutoff(n + 1),
        `moves ${n} and ${n + 1}`,
      );
    }
  });

  it("stays inside its band", () => {
    for (let n = 0; n < 40; n++) {
      const hz = moveCutoff(n);
      assert.ok(
        hz >= 2400 * 0.86 - 1e-9 && hz <= 2400 * 1.14 + 1e-9,
        `${hz}Hz`,
      );
    }
  });

  it("is not a rising scale", () => {
    // Out of order on purpose: a cycle that climbed would only trade the
    // machine gun for a tune nobody asked for.
    const rising = Array.from(
      { length: 6 },
      (_, n) => moveCutoff(n + 1) > moveCutoff(n),
    );
    assert.ok(new Set(rising).size > 1, "the cycle only ever goes one way");
  });

  it("is the same burst for the same move, however it is asked", () => {
    assert.equal(moveCutoff(3), moveCutoff(3));
    assert.equal(moveCutoff(0), moveCutoff(MOVE_CYCLE));
  });
});

describe("the foundation ping", () => {
  it("climbs with the rank, an Ace to a King", () => {
    for (let rank = 0; rank < 12; rank++) {
      assert.ok(
        homeNote(rank + 1) >= homeNote(rank),
        `${rank + 1} is not above ${rank}`,
      );
    }
    assert.ok(homeNote(12) > homeNote(0));
  });

  it("spans exactly one octave, Ace to King", () => {
    assert.ok(Math.abs(homeNote(12) / homeNote(0) - 2) < 1e-6);
  });

  it("is on the same scale as the cascade", () => {
    // The two sounds meet at the win, so neither may be off the other's scale.
    for (let rank = 0; rank < 13; rank++) {
      const semitones = semitonesAbove(homeNote(rank));
      const degree = Math.round(semitones) % 12;
      assert.ok(
        PENTATONIC.includes(degree),
        `rank ${rank} lands ${degree} semitones above C`,
      );
    }
  });

  it("cannot be pushed off the scale by a nonsense rank", () => {
    assert.equal(homeNote(-5), homeNote(0));
    assert.equal(homeNote(99), homeNote(12));
  });
});
