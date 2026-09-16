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
 * rather than a rendering. The part worth pinning is the one piece of
 * behaviour that is not a straight copy: a table brings a deck and a back with
 * it until the player says otherwise.
 */

const with_ = (patch: Partial<Settings>): Settings => ({
  ...DEFAULTS,
  ...patch,
});

describe("settings", () => {
  it("opens on the warm table with its own deck and back", () => {
    assert.deepEqual(resolve(DEFAULTS), {
      theme: "warm",
      deck: "minimal",
      back: "lattice",
    });
  });

  it("hands the minimal table its flat back", () => {
    // The whole of what "a theme has a default deck" means: picking the
    // Minimal table should not leave the warm table's woven lattice on it.
    assert.deepEqual(resolve(with_({ theme: "minimal" })), {
      theme: "minimal",
      deck: "minimal",
      back: "solid",
    });
  });

  it("keeps a chosen deck and back across a change of table", () => {
    const chosen = with_({ deck: "four-colour", back: "dots" });
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
      back: "lattice",
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
        for (const back of [AUTO, ...BACKS] as Settings["back"][]) {
          const settings = with_({ theme, deck, back });
          const root = { dataset: {} as Record<string, string> };
          apply(settings, root as never);
          assert.deepEqual(
            run(settings),
            root.dataset,
            `${theme} / ${deck} / ${back}`,
          );
        }
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
    assert.deepEqual(run({ theme: "neon", deck: "wombat", back: 4 }), fallback);
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
