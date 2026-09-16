import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTO,
  BACKS,
  BOOTSTRAP,
  DECKS,
  DEFAULTS,
  SETTINGS_KEY,
  THEMES,
  type Settings,
  apply,
  resolve,
} from "../../src/game/settings.ts";

/**
 * The settings are data, and what a set of them resolves to is arithmetic
 * rather than a rendering. The part worth pinning is the two pieces of
 * behaviour that are not a straight copy: a table brings a deck with it until
 * the player says otherwise, and a deck brings its back — always, because a
 * back is not something anybody chooses.
 */

const with_ = (patch: Partial<Settings>): Settings => ({
  ...DEFAULTS,
  ...patch,
});

describe("settings", () => {
  it("opens on the warm table with its own deck, and that deck's back", () => {
    assert.deepEqual(resolve(DEFAULTS), {
      theme: "warm",
      deck: "minimal",
      back: "lattice",
    });
  });

  /**
   * The rule the settings sheet lost a whole section to: **a back belongs to
   * the deck.** A real pack comes printed on one, and offering it separately
   * made it possible to put the flat accessibility back on the French deck's
   * Victorian courts — two decks in one pack.
   */
  it("gives every deck a back, and gives the player no say in it", () => {
    const backs = new Map(
      DECKS.map((deck) => [deck, resolve(with_({ deck })).back]),
    );
    assert.equal(backs.size, DECKS.length);
    for (const [deck, back] of backs) {
      assert.ok(
        (BACKS as readonly string[]).includes(back),
        `${deck} is printed on ${back}, which is not one of ours`,
      );
    }
    /*
     * The five we draw get one each and no two the same: a back is how a deck
     * is recognised face-down, twenty-eight of them are face-down at deal
     * time, and for these decks this is the *only* back there is.
     *
     * The sourced decks are not held to that, because for them this is a
     * fallback: each is printed on the back out of its own sprite, and what is
     * named here is what a player sees for the second or two before that
     * arrives — or for good, on a connection that never brings it. Sixteen
     * decks would otherwise need sixteen patterns to say something no one ever
     * sees.
     */
    const drawn = [
      "minimal",
      "classic",
      "vintage",
      "high-contrast",
      "four-colour",
    ] as const;
    assert.equal(new Set(drawn.map((deck) => backs.get(deck))).size, 5);
  });

  it("keeps a chosen deck, and its back, across a change of table", () => {
    const chosen = with_({ deck: "four-colour" });
    for (const theme of ["warm", "minimal", "dark"] as const) {
      const resolved = resolve({ ...chosen, theme });
      assert.equal(resolved.deck, "four-colour");
      assert.equal(resolved.back, "dots");
    }
  });

  it("goes back to the table's own choice when asked to match it", () => {
    const chosen = with_({ theme: "minimal", deck: "high-contrast" });
    assert.equal(resolve(chosen).deck, "high-contrast");
    assert.equal(resolve({ ...chosen, deck: AUTO }).deck, "minimal");
  });

  it("is three attributes and nothing else", () => {
    // Every look in the product hangs off these three. If apply() ever writes
    // a fourth, a stylesheet somewhere has grown a second way to be selected.
    const root = { dataset: {} as Record<string, string> };
    apply(with_({ theme: "dark", deck: "four-colour" }), root as never);
    assert.deepEqual(root.dataset, {
      theme: "dark",
      deck: "four-colour",
      back: "dots",
    });
  });
});

/**
 * The pre-paint bootstrap is a second implementation of `apply(resolve(…))`,
 * written as a string so it can run in the document head before anything is
 * fetched. Two implementations of one rule drift, so this runs the real script
 * against every combination of stored settings and asserts the two agree.
 */
describe("the bootstrap in the document head", () => {
  function run(stored: unknown): Record<string, string> {
    const dataset: Record<string, string> = {};
    const storage = {
      getItem: (key: string) =>
        key === SETTINGS_KEY && stored !== undefined
          ? JSON.stringify(stored)
          : null,
    };
    new Function("localStorage", "document", BOOTSTRAP)(storage, {
      documentElement: { dataset },
    });
    return dataset;
  }

  it("writes what apply() would, for every choice a player can make", () => {
    for (const theme of THEMES) {
      for (const deck of [AUTO, ...DECKS] as Settings["deck"][]) {
        const settings = with_({ theme, deck });
        const root = { dataset: {} as Record<string, string> };
        apply(settings, root as never);
        assert.deepEqual(run(settings), root.dataset, `${theme} / ${deck}`);
      }
    }
  });

  it("writes the defaults when there is nothing stored", () => {
    assert.deepEqual(run(undefined), { ...resolve(DEFAULTS) });
  });

  /**
   * Storage holds whatever was last pasted into it, and this script runs
   * before the validating reader in Persist.ts exists. A bad value here would
   * be a frame of cards with no deck tokens at all.
   */
  it("writes a real table for anything else it finds in storage", () => {
    const fallback = { ...resolve(DEFAULTS) };
    assert.deepEqual(run({ theme: "neon", deck: "wombat" }), fallback);
    // A back left over from the version of this that let you pick one is not a
    // back: it is a field nothing reads any more.
    assert.deepEqual(run({ theme: "warm", back: "dots" }), fallback);
    assert.deepEqual(run(null), fallback);
    assert.deepEqual(run("a string"), fallback);
    assert.deepEqual(run({ deck: AUTO }), fallback);
  });

  it("survives a browser that will not hand over storage at all", () => {
    const dataset: Record<string, string> = {};
    const hostile = {
      getItem: () => {
        throw new Error("SecurityError");
      },
    };
    new Function("localStorage", "document", BOOTSTRAP)(hostile, {
      documentElement: { dataset },
    });
    assert.deepEqual(dataset, { ...resolve(DEFAULTS) });
  });
});
