/**
 * What does tap-to-auto-move cost you?
 *
 * Not part of any build or any test run — `node scripts/audit-automove.ts
 * [seeds]`, and it takes a minute or two. It exists because
 * docs/07-architecture.md flags the auto-move heuristic as the thing most
 * likely to need tuning and says it can only be judged by playing, which is
 * true of the half that is taste and not of the half that is arithmetic. This
 * is the arithmetic half.
 *
 * A greedy player with loop avoidance — the same one `test/engine/helpers.ts`
 * uses, copied rather than shared because a test helper is not a public
 * surface — picks the move it wants. Two runs over the same seeds:
 *
 * - **direct**: it plays that move.
 * - **tapped**: it taps the card that move names, and `autoMove` decides where
 *   the card actually goes.
 *
 * The gap between the two win rates is what the interface's guess costs. The
 * divergence breakdown says which rule is doing the guessing, and the choice
 * count says how often the heuristic has a decision to make at all.
 *
 * The tie-break gets its own pass. `bestColumn` breaks a tie between equal
 * columns by taking the leftmost, which was flagged as arbitrary, so the third
 * section replays the tapped run with five other rules substituted — and with
 * a count of how often a tap has a tie to break at all, which is the number
 * that settles it.
 *
 * A greedy player is not a person and its preferences are not a person's. What
 * this can prove is that the heuristic does not *lose games*; whether it picks
 * the move you wanted is still a question for someone playing fifty of them.
 */
import {
  type Card,
  type Column,
  type GameState,
  type Move,
  applyMove,
  deal,
  faceUpCount,
  isLegal,
  isWon,
  legalMoves,
  rankOf,
} from "../src/engine/index.ts";
import { type Hit } from "../src/game/Layout.ts";
import { autoMove } from "../src/game/automove.ts";

/** Where you would tap to ask for this move. */
function tapFor(state: GameState, move: Move): Hit | null {
  switch (move.kind) {
    case "draw":
    case "recycle":
      return { ref: { pile: "stock" }, index: -1, card: null };

    case "wasteToTableau":
    case "wasteToFoundation": {
      const index = state.waste.length - 1;
      if (index < 0) return null;
      return {
        ref: { pile: "waste" },
        index,
        card: state.waste[index] as Card,
      };
    }

    case "tableauToTableau":
    case "tableauToFoundation": {
      const column = state.tableau[move.from] as Column;
      const index =
        column.cards.length -
        (move.kind === "tableauToTableau" ? move.count : 1);
      if (index < 0) return null;
      return {
        ref: { pile: "tableau", column: move.from },
        index,
        card: column.cards[index] as Card,
      };
    }

    // A tap on a foundation does nothing by design, and the greedy player
    // never asks for one of these.
    case "foundationToTableau":
      return null;
  }
}

/**
 * How many *different* non-empty columns this tap could legally have sent its
 * card to. Anything above one is a tie, and a tie is what the leftmost rule in
 * `automove.ts` breaks arbitrarily.
 */
function targetCount(state: GameState, hit: Hit): number {
  if (hit.ref.pile === "stock" || hit.ref.pile === "foundation") return 0;
  const from = hit.ref.pile === "tableau" ? hit.ref.column : -1;
  const count =
    hit.ref.pile === "tableau"
      ? (state.tableau[from] as Column).cards.length - hit.index
      : 1;

  let n = 0;
  for (let to = 0; to < state.tableau.length; to++) {
    if ((state.tableau[to] as Column).cards.length === 0) continue;
    const move: Move =
      hit.ref.pile === "waste"
        ? { kind: "wasteToTableau", to }
        : { kind: "tableauToTableau", from, to, count };
    if (isLegal(state, move)) n++;
  }
  return n;
}

/** How a tie between two legal columns might be broken. `null` is what ships. */
type Preference = ((state: GameState, to: number) => number) | null;

const PREFERENCES: Record<string, Preference> = {
  "leftmost (ships)": null,
  rightmost: (_state, to) => to,
  "most buried": (state, to) => (state.tableau[to] as Column).down,
  "least buried": (state, to) => -(state.tableau[to] as Column).down,
  shortest: (state, to) => -(state.tableau[to] as Column).cards.length,
  longest: (state, to) => (state.tableau[to] as Column).cards.length,
};

/**
 * Send a tapped card to a different one of the columns it could legally have
 * gone to. Substituting the choice from outside is exactly what varying
 * `bestColumn`'s tie-break does, and it needs no hook in the shipping code.
 *
 * A move onto an *empty* column is left alone: that is rule 4, the hole for a
 * King, and it is not the tie this is about.
 */
function retarget(state: GameState, move: Move, prefer: Preference): Move {
  if (prefer === null) return move;
  if (move.kind !== "tableauToTableau" && move.kind !== "wasteToTableau") {
    return move;
  }
  if ((state.tableau[move.to] as Column).cards.length === 0) return move;

  let best = move;
  let bestRank = -Infinity;
  for (let to = 0; to < state.tableau.length; to++) {
    if ((state.tableau[to] as Column).cards.length === 0) continue;
    const candidate: Move =
      move.kind === "wasteToTableau"
        ? { kind: "wasteToTableau", to }
        : { ...move, to };
    if (!isLegal(state, candidate)) continue;
    const rank = prefer(state, to);
    if (rank > bestRank) {
      best = candidate;
      bestRank = rank;
    }
  }
  return best;
}

/** The greedy player. Not the hint heuristic, and nothing ships it. */
function greedyScore(state: GameState, move: Move): number {
  switch (move.kind) {
    case "tableauToFoundation": {
      const column = state.tableau[move.from] as Column;
      const card = column.cards[column.cards.length - 1] as Card;
      const turns = column.down > 0 && faceUpCount(column) === 1;
      return rankOf(card) <= 1 ? 100 : turns ? 90 : 55;
    }
    case "wasteToFoundation": {
      const card = state.waste[state.waste.length - 1] as Card;
      return rankOf(card) <= 1 ? 100 : 55;
    }
    case "tableauToTableau": {
      const column = state.tableau[move.from] as Column;
      const to = state.tableau[move.to] as Column;
      if (column.down > 0 && move.count === faceUpCount(column)) {
        return 80 + column.down;
      }
      // Never relocate a hole, and never break a column up for nothing.
      if (to.cards.length === 0) {
        return column.down === 0 && move.count === column.cards.length
          ? -1
          : 60;
      }
      return 20;
    }
    case "wasteToTableau":
      return 70;
    case "draw":
      return 10;
    case "recycle":
      return 5;
    default:
      return 0;
  }
}

function stateKey(state: GameState): string {
  return JSON.stringify([
    state.stock,
    state.waste,
    state.foundations,
    state.tableau,
  ]);
}

interface Tally {
  games: number;
  won: number;
  home: number;
  taps: number;
  diverged: number;
  /** Taps with a tableau target at all, and taps with more than one. */
  targeted: number;
  ties: number;
  kinds: Map<string, number>;
}

function tally(): Tally {
  return {
    games: 0,
    won: 0,
    home: 0,
    taps: 0,
    diverged: 0,
    targeted: 0,
    ties: 0,
    kinds: new Map(),
  };
}

const BUDGET = 4000;

function play(
  seed: number,
  drawCount: 1 | 3,
  tapping: boolean,
  into: Tally,
  prefer: Preference = null,
): void {
  let state = deal(seed, drawCount);
  const visited = new Set([stateKey(state)]);

  for (let step = 0; step < BUDGET && !isWon(state); step++) {
    const ranked = legalMoves(state)
      .filter((move) => move.kind !== "foundationToTableau")
      .sort((a, b) => greedyScore(state, b) - greedyScore(state, a));

    let played: { next: GameState; key: string } | null = null;
    for (const wanted of ranked) {
      let move: Move = wanted;
      let hit: Hit | null = null;
      if (tapping) {
        hit = tapFor(state, wanted);
        const choice = hit === null ? null : autoMove(state, hit);
        if (choice !== null) move = retarget(state, choice, prefer);
        else hit = null;
      }

      const next = applyMove(state, move);
      const key = stateKey(next);
      // The loop guard is on what is actually played, not on what was wanted.
      if (visited.has(key)) continue;

      if (hit !== null) {
        into.taps++;
        const targets = targetCount(state, hit);
        if (targets > 0) into.targeted++;
        if (targets > 1) into.ties++;
        if (JSON.stringify(move) !== JSON.stringify(wanted)) {
          into.diverged++;
          const label =
            move.kind === wanted.kind
              ? `${move.kind}, but to somewhere else`
              : `wanted ${wanted.kind}, got ${move.kind}`;
          into.kinds.set(label, (into.kinds.get(label) ?? 0) + 1);
        }
      }
      played = { next, key };
      break;
    }

    if (played === null) break;
    state = played.next;
    visited.add(played.key);
  }

  into.games++;
  if (isWon(state)) into.won++;
  into.home += state.foundations.reduce((n, pile) => n + pile.length, 0);
}

function report(label: string, t: Tally): void {
  const pct = (n: number, of: number): string =>
    of === 0 ? "—" : `${((100 * n) / of).toFixed(1)}%`;
  console.log(
    `${label.padEnd(14)} won ${String(t.won).padStart(4)}/${t.games}` +
      ` (${pct(t.won, t.games)})   ${(t.home / t.games).toFixed(1)}/52 home`,
  );
  if (t.taps === 0) return;
  console.log(
    `               ${t.diverged} of ${t.taps} taps went somewhere the` +
      ` player did not ask for (${pct(t.diverged, t.taps)})`,
  );
  for (const [kind, n] of [...t.kinds].sort((a, b) => b[1] - a[1])) {
    console.log(`                 ${String(n).padStart(6)}  ${kind}`);
  }
  console.log(
    `               ${t.ties} of ${t.targeted} taps with a column to go to had` +
      ` more than one (${pct(t.ties, t.targeted)})`,
  );
}

const seeds = Number(process.argv[2] ?? 400);
for (const drawCount of [1, 3] as const) {
  console.log(`\n── draw-${drawCount}, deals 1–${seeds} ──`);
  for (const tapping of [false, true]) {
    const t = tally();
    for (let seed = 1; seed <= seeds; seed++) play(seed, drawCount, tapping, t);
    report(tapping ? "tapped" : "direct", t);
  }

  console.log("  breaking a tie between equal columns, every other way:");
  for (const [name, prefer] of Object.entries(PREFERENCES)) {
    const t = tally();
    for (let seed = 1; seed <= seeds; seed++) {
      play(seed, drawCount, true, t, prefer);
    }
    console.log(
      `    ${name.padEnd(18)} won ${String(t.won).padStart(4)}/${t.games}` +
        `  ${(t.home / t.games).toFixed(1)}/52 home`,
    );
  }
}
