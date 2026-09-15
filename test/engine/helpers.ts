/**
 * Shared test scaffolding. Not a `.test.ts` file, so `node --test` ignores it.
 */

import {
  type Card,
  type Rank,
  type Suit,
  cardName,
  cardOf,
  canStack,
  rankOf,
  suitOf,
} from "../../src/engine/card.ts";
import { type Move, applyMove } from "../../src/engine/moves.ts";
import { legalMoves } from "../../src/engine/enumerate.ts";
import {
  type Column,
  type DrawCount,
  type GameState,
  TABLEAU_COLUMNS,
  faceUpCount,
  isWon,
} from "../../src/engine/state.ts";

const RANK_LETTERS = "A23456789TJQK";
const SUIT_SYMBOLS = "♣♦♥♠";
const SUIT_LETTERS = "CDHS";

/** `"7♥"` or `"7H"` → a card. Throws on anything else, since it is test input. */
export function parseCard(name: string): Card {
  const rank = RANK_LETTERS.indexOf(name[0]?.toUpperCase() ?? "");
  const symbol = name[1] ?? "";
  const suit =
    SUIT_SYMBOLS.indexOf(symbol) >= 0
      ? SUIT_SYMBOLS.indexOf(symbol)
      : SUIT_LETTERS.indexOf(symbol.toUpperCase());
  if (rank < 0 || suit < 0 || name.length !== 2) {
    throw new Error(`not a card: ${JSON.stringify(name)}`);
  }
  return cardOf(suit as Suit, rank as Rank);
}

export function parseCards(list: string): Card[] {
  return list.trim() === "" ? [] : list.trim().split(/\s+/).map(parseCard);
}

export function showCards(cards: readonly Card[]): string {
  return cards.map(cardName).join(" ");
}

export function showColumn(column: Column): string {
  const down = column.cards.slice(0, column.down);
  const up = column.cards.slice(column.down);
  return column.down > 0
    ? `${showCards(down)} | ${showCards(up)}`
    : showCards(up);
}

/**
 * A column written as `"A♣ T♦ | 5♠ 4♥"` — face-down cards, a pipe, then the
 * face-up ones. No pipe means the whole column is face up; `""` is an empty
 * column.
 */
function parseColumn(spec: string): Column {
  const [downPart, upPart] = spec.includes("|") ? spec.split("|") : ["", spec];
  const down = parseCards(downPart ?? "");
  const up = parseCards(upPart ?? "");
  return { cards: [...down, ...up], down: down.length };
}

export type StateSpec = {
  /** Up to seven columns; the rest are empty. */
  tableau?: string[];
  /** Face down, first card listed is the next drawn. */
  stock?: string;
  /** Face up, last card listed is the playable top. */
  waste?: string;
  /** The top card of each non-empty foundation, e.g. `"5♣ A♦"`. */
  foundations?: string;
  drawCount?: DrawCount;
  seed?: number;
  moves?: number;
};

/**
 * A hand-written position, for testing rules in isolation.
 *
 * It builds exactly what you describe and nothing more — the deck is usually
 * incomplete and the columns need not be positions a real game could reach.
 * That is the point: negative rule tests want illegal-looking boards.
 */
export function makeState(spec: StateSpec = {}): GameState {
  const tableau: Column[] = Array.from({ length: TABLEAU_COLUMNS }, (_, n) =>
    parseColumn(spec.tableau?.[n] ?? ""),
  );

  const foundations: Card[][] = [[], [], [], []];
  for (const top of parseCards(spec.foundations ?? "")) {
    const suit = suitOf(top);
    foundations[suit] = Array.from({ length: rankOf(top) + 1 }, (_, rank) =>
      cardOf(suit, rank as Rank),
    );
  }

  return {
    stock: parseCards(spec.stock ?? ""),
    waste: parseCards(spec.waste ?? ""),
    foundations,
    tableau,
    drawCount: spec.drawCount ?? 1,
    seed: spec.seed ?? 0,
    moves: spec.moves ?? 0,
  };
}

/**
 * Everything that must be true of any state reachable by legal play. Returns
 * the violations rather than throwing, so a failure can name all of them.
 */
export function invariantViolations(state: GameState): string[] {
  const problems: string[] = [];

  const seen = new Map<Card, string>();
  const count = (cards: readonly Card[], where: string) => {
    for (const card of cards) {
      const already = seen.get(card);
      if (already !== undefined) {
        problems.push(`${cardName(card)} is in both ${already} and ${where}`);
      }
      seen.set(card, where);
    }
  };
  count(state.stock, "stock");
  count(state.waste, "waste");
  state.foundations.forEach((pile, suit) => count(pile, `foundation ${suit}`));
  state.tableau.forEach((column, n) => count(column.cards, `column ${n}`));
  if (seen.size !== 52)
    problems.push(`${seen.size} distinct cards, expected 52`);

  state.foundations.forEach((pile, suit) => {
    pile.forEach((card, rank) => {
      if (suitOf(card) !== suit || rankOf(card) !== rank) {
        problems.push(
          `foundation ${suit} holds ${cardName(card)} at position ${rank}`,
        );
      }
    });
  });

  state.tableau.forEach((column, n) => {
    if (column.down > column.cards.length) {
      problems.push(
        `column ${n} has ${column.down} down of ${column.cards.length}`,
      );
    }
    if (column.cards.length > 0 && column.down === column.cards.length) {
      problems.push(`column ${n} is all face down — a turnover was missed`);
    }
    for (let i = column.down; i < column.cards.length - 1; i++) {
      if (!canStack(column.cards[i + 1] as Card, column.cards[i] as Card)) {
        problems.push(
          `column ${n} face-up run is out of sequence: ${showColumn(column)}`,
        );
      }
    }
  });

  return problems;
}

/** A compact identity for a position, used to spot repetition while searching. */
export function stateKey(state: GameState): string {
  return [
    state.stock.join(","),
    state.waste.join(","),
    state.foundations.map((pile) => pile.length).join(","),
    state.tableau.map((c) => `${c.down}:${c.cards.join(",")}`).join(";"),
  ].join("|");
}

/**
 * A greedy Klondike player, good enough to win a decent share of draw-1 deals.
 * It exists to prove the rules compose into a game that can actually be won —
 * it is not the hint heuristic, and nothing ships it.
 */
export function playGreedily(
  start: GameState,
  budget = 4000,
): { state: GameState; moves: Move[] } {
  let state = start;
  const played: Move[] = [];
  const visited = new Set<string>([stateKey(start)]);

  for (let step = 0; step < budget && !isWon(state); step++) {
    const ranked = legalMoves(state)
      .filter((move) => move.kind !== "foundationToTableau")
      .map((move) => ({ move, next: applyMove(state, move) }))
      .filter(({ next }) => !visited.has(stateKey(next)))
      .sort((a, b) => greedyScore(state, b.move) - greedyScore(state, a.move));

    const choice = ranked[0];
    if (choice === undefined) break;
    state = choice.next;
    played.push(choice.move);
    visited.add(stateKey(state));
  }

  return { state, moves: played };
}

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
