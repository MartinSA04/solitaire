import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTO,
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
  it("gives every deck its own back, and gives the player no say in it", () => {
    const backs = new Map(
      DECKS.map((deck) => [deck, resolve(with_({ deck })).back]),
    );
    assert.deepEqual([...backs.values()].sort(), [
      "argyle",
      "dots",
      "lattice",
      "pinstripe",
      "ripple",
      "solid",
    ]);
    // No two decks share one, which is the point: the back is how a deck is
    // recognised face-down, and twenty-eight of them are face-down at deal.
    assert.equal(new Set(backs.values()).size, DECKS.length);
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
