import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ARPEGGIO_DEGREES,
  bounceCutoff,
  bounceLevel,
  bounceNote,
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
