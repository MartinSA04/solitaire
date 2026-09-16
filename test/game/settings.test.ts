import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTO,
  DEFAULTS,
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
