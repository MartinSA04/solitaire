import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

import { deal } from "../../src/engine/deal.ts";
import { isWon } from "../../src/engine/state.ts";
import { invariantViolations, playGreedily } from "./helpers.ts";

/**
 * The engine is pure TypeScript: no DOM, no timers, no randomness that isn't
 * seeded, and no import from anywhere else in `src/`. That is not purity for
 * its own sake — it is what lets the same rules run under `node --test`,
 * inside the build-time solver, and in the browser, and it is what keeps the
 * win sequence free to do whatever it likes to the pixels without the rules
 * noticing.
 *
 * Checked by reading the source, because nothing else would: the engine would
 * work fine in a browser with a `Date.now()` in it, right up until a saved
 * game replayed differently than it was recorded.
 */

const ENGINE = new URL("../../src/engine/", import.meta.url);

const sources = readdirSync(ENGINE)
  .filter((name) => name.endsWith(".ts"))
  .map((name) => ({
    name,
    code: stripComments(readFileSync(new URL(name, ENGINE), "utf8")),
  }));

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const FORBIDDEN = [
  "window",
  "document",
  "globalThis",
  "navigator",
  "localStorage",
  "sessionStorage",
  "fetch",
  "XMLHttpRequest",
  "performance",
  "setTimeout",
  "setInterval",
  "requestAnimationFrame",
  "process",
  "Math.random",
  "Date",
  "crypto",
];

describe("the engine's source", () => {
  it("is not empty, or this whole file proves nothing", () => {
    assert.ok(sources.length >= 8, `found ${sources.length} engine files`);
  });

  it("touches nothing outside itself", () => {
    for (const { name, code } of sources) {
      for (const forbidden of FORBIDDEN) {
        const pattern = new RegExp(`\\b${forbidden.replace(".", "\\.")}\\b`);
        assert.equal(
          pattern.test(code),
          false,
          `${name} refers to ${forbidden}`,
        );
      }
    }
  });

  it("imports only from the engine", () => {
    for (const { name, code } of sources) {
      const imports = [...code.matchAll(/\bfrom\s+"([^"]+)"/g)].map(
        (m) => m[1],
      );
      for (const specifier of imports) {
        assert.match(
          specifier as string,
          /^\.\/[\w-]+\.ts$/,
          `${name} imports ${specifier}, which is not an engine module`,
        );
      }
    }
  });
});

describe("the engine at runtime", () => {
  it("runs a game to a win with no browser anywhere in sight", () => {
    assert.equal(typeof window, "undefined", "there should be no window here");
    const { state } = playGreedily(deal(3, 1));
    assert.ok(isWon(state));
    assert.deepEqual(invariantViolations(state), []);
  });
});
