import {
  type Card,
  type Column,
  type GameState,
  type Suit,
  CLUBS,
  DECK_SIZE,
  DIAMONDS,
  HEARTS,
  SPADES,
  TABLEAU_COLUMNS,
} from "../engine/index.ts";

/**
 * Board geometry. Pure: an available area in, numbers out — no DOM, no reads,
 * no side effects. Everything the card layer, the hit-tester and the CSS agree
 * on is computed here exactly once per resize, which is what
 * docs/05-interaction-and-motion.md means by "no layout reads during
 * animation".
 *
 * This module is the single source of truth for the board's measurements. The
 * empty slots are laid out by CSS, but from custom properties written from
 * these numbers (`--card-w`, `--gap`, `--gutter`, …), so the grid and the
 * transforms cannot drift apart. CSS derives nothing it isn't given.
 *
 * `test/game/layout.test.ts` pins golden values for 360/390/768/1440.
 */

/**
 * Everything is a multiple of the card width, per
 * docs/05-interaction-and-motion.md — there are no breakpoints for the board,
 * only one computed `--card-w`.
 *
 * The ratios are the phone target read backwards: on a 360px viewport the spec
 * wants an 8px gutter, a 4px gap and a ~46px card, so a gap is 0.087 of a card
 * and a gutter is two gaps.
 */
const GAP_RATIO = 0.087;
const GUTTER_RATIO = 2 * GAP_RATIO;

/** Poker, 2.5 : 3.5, locked. Height is never set independently. */
const ASPECT = 3.5 / 2.5;

/**
 * Past this a solitaire table stops being a table and starts being a poster.
 *
 * Exported because it is also the size the win sequence's physics constants
 * were written at — see the scaling note in `cascade.ts`.
 */
export const MAX_CARD_W = 110;

/** Between the stock/foundation row and the tableau, as a fraction of card height. */
const ROW_GAP_RATIO = 0.25;

/** 8px at a 110px card, scaled down proportionally so a phone card isn't a lozenge. */
const RADIUS_RATIO = 8 / MAX_CARD_W;

/** Fan offsets, as fractions of card height: an edge for face-down, a legible index for face-up. */
const FAN_DOWN_RATIO = 0.14;
const FAN_UP_RATIO = 0.3;

/**
 * How far a column may be squeezed before we refuse to make the cards smaller
 * instead. A column that would overflow compresses; the board never scrolls.
 */
const MIN_FAN_RATIO = 0.06;

/** The draw-3 waste fan, as a fraction of card width. The fan is what makes draw-3 readable. */
const WASTE_FAN_RATIO = 0.28;

/** At most three waste cards are ever fanned; the rest sit under the first. */
const WASTE_FANNED = 3;

/**
 * Thirteen face-up cards on six face-down ones: the longest column Klondike can
 * produce. Capping the card size so *this* fits at minimum fan is what makes
 * "the board never scrolls" unconditional rather than usually true.
 */
const WORST_COLUMN = 19;

/** Hit areas overrun the card by this much on every side — see docs/08-accessibility.md. */
export const HIT_PAD = 4;

/** The four foundations, left to right, as docs/02-game-spec.md draws them. */
export const FOUNDATION_ORDER: readonly Suit[] = [
  SPADES,
  HEARTS,
  DIAMONDS,
  CLUBS,
];

/** Column 2 of the top row is the gap between the waste and the foundations. */
const STOCK_COLUMN = 0;
const WASTE_COLUMN = 1;
const FIRST_FOUNDATION_COLUMN = 3;

export type PileRef =
  | { pile: "stock" }
  | { pile: "waste" }
  | { pile: "foundation"; suit: Suit }
  | { pile: "tableau"; column: number };

export interface Area {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Metrics extends Area {
  cardW: number;
  cardH: number;
  gap: number;
  gutter: number;
  radius: number;
  rowGap: number;
  fanDown: number;
  fanUp: number;
  minFan: number;
  wasteFan: number;
  /** Seven columns plus six gaps: the board proper, inside the gutters. */
  boardW: number;
  /** Left edge of column 0. Equals the gutter until the card width caps out and the board centres. */
  originX: number;
  /** Top of the tableau row. */
  tableauY: number;
  /** How much height a column has before it must compress. */
  tableauH: number;
}

/**
 * Card size is whichever of three limits bites first: the width has to hold
 * seven columns, the height has to hold the top row plus the worst column the
 * game can deal, and past 110px we simply stop growing.
 */
export function metricsFor(area: Area): Metrics {
  const byWidth = area.width / (TABLEAU_COLUMNS + 10 * GAP_RATIO);
  const byHeight =
    area.height /
    (ASPECT * (2 + ROW_GAP_RATIO + (WORST_COLUMN - 1) * MIN_FAN_RATIO));

  const cardW = Math.max(1, Math.min(MAX_CARD_W, byWidth, byHeight));
  const cardH = cardW * ASPECT;
  const gap = cardW * GAP_RATIO;
  const boardW = TABLEAU_COLUMNS * cardW + (TABLEAU_COLUMNS - 1) * gap;
  const rowGap = cardH * ROW_GAP_RATIO;
  const tableauY = cardH + rowGap;

  return {
    width: area.width,
    height: area.height,
    cardW,
    cardH,
    gap,
    gutter: cardW * GUTTER_RATIO,
    radius: cardW * RADIUS_RATIO,
    rowGap,
    fanDown: cardH * FAN_DOWN_RATIO,
    fanUp: cardH * FAN_UP_RATIO,
    minFan: cardH * MIN_FAN_RATIO,
    wasteFan: cardW * WASTE_FAN_RATIO,
    boardW,
    // Centring and gutters are the same thing until the card width caps out,
    // at which point the leftover width becomes table rather than card.
    originX: (area.width - boardW) / 2,
    tableauY,
    tableauH: area.height - tableauY,
  };
}

function columnX(m: Metrics, column: number): number {
  return m.originX + column * (m.cardW + m.gap);
}

/** The top-left corner of a pile's slot, in card-layer coordinates. */
export function pileOrigin(m: Metrics, ref: PileRef): Point {
  switch (ref.pile) {
    case "stock":
      return { x: columnX(m, STOCK_COLUMN), y: 0 };
    case "waste":
      return { x: columnX(m, WASTE_COLUMN), y: 0 };
    case "foundation":
      return {
        x: columnX(m, FIRST_FOUNDATION_COLUMN + foundationSlot(ref.suit)),
        y: 0,
      };
    case "tableau":
      return { x: columnX(m, ref.column), y: m.tableauY };
  }
}

function foundationSlot(suit: Suit): number {
  return FOUNDATION_ORDER.indexOf(suit);
}

/**
 * Stacking order. A pile's band is its index × 100, plus the card's position in
 * the pile — so a card flying from column 2 to a foundation passes *over*
 * columns 3 to 7 rather than under them, which is the whole reason foundations
 * sit at the top of the order and the tableau at the bottom.
 */
const Z_BAND = 100;
const Z_STOCK = TABLEAU_COLUMNS * Z_BAND;
const Z_WASTE = Z_STOCK + Z_BAND;
const Z_FOUNDATION = Z_WASTE + Z_BAND;

/**
 * Two bands above the resting ones. A card in flight keeps its destination z
 * *within* the band, so several cards moving at once keep their order, and it
 * is lifted clear of everything at rest so nothing it crosses cuts through it.
 * The lift is dropped once the card has landed, where it is invisible —
 * docs/05-interaction-and-motion.md's rule is that z never changes *during* a
 * move, not that it never changes.
 */
export const Z_FLIGHT = 2000;

/**
 * The win sequence's trail canvas, which sits *beneath* the cards and above
 * everything else — including the chrome, which is fading out by the time it
 * has anything to draw. Stage 2 lifts all 52 cards to {@link Z_FLIGHT} and
 * above, so the layering holds however the board was arranged when it was won.
 */
export const Z_TRAILS = 1500;

/** Above everything, including a card in flight. */
export const Z_DRAG = 4000;

function pileZ(ref: PileRef): number {
  switch (ref.pile) {
    case "stock":
      return Z_STOCK;
    case "waste":
      return Z_WASTE;
    case "foundation":
      return Z_FOUNDATION + foundationSlot(ref.suit) * Z_BAND;
    case "tableau":
      return ref.column * Z_BAND;
  }
}

export interface Placement extends Point {
  faceUp: boolean;
  z: number;
}

/**
 * Where all 52 cards belong in the current position, indexed by card number.
 *
 * Every card is placed on every render: the card layer holds 52 persistent
 * elements and a move is a changed transform, never a reparenting. See
 * docs/05-interaction-and-motion.md.
 */
export function placeAll(m: Metrics, state: GameState): Placement[] {
  const placements: Placement[] = new Array(DECK_SIZE);

  const stock = pileOrigin(m, { pile: "stock" });
  state.stock.forEach((card, i) => {
    placements[card] = {
      x: stock.x,
      y: stock.y,
      faceUp: false,
      z: Z_STOCK + i,
    };
  });

  placeWaste(m, state, placements);

  for (const suit of FOUNDATION_ORDER) {
    const origin = pileOrigin(m, { pile: "foundation", suit });
    const pile = state.foundations[suit] as Card[];
    pile.forEach((card, i) => {
      placements[card] = {
        x: origin.x,
        y: origin.y,
        faceUp: true,
        z: pileZ({ pile: "foundation", suit }) + i,
      };
    });
  }

  state.tableau.forEach((column, index) => {
    const origin = pileOrigin(m, { pile: "tableau", column: index });
    const offsets = columnOffsets(m, column);
    column.cards.forEach((card, i) => {
      placements[card] = {
        x: origin.x,
        y: origin.y + (offsets[i] as number),
        faceUp: i >= column.down,
        z: index * Z_BAND + i,
      };
    });
  });

  return placements;
}

/**
 * Only the last three waste cards are fanned, and only in draw-3 — in draw-1
 * the waste is a square pile, which is what it looks like on a table.
 */
function placeWaste(
  m: Metrics,
  state: GameState,
  placements: Placement[],
): void {
  const origin = pileOrigin(m, { pile: "waste" });
  const fanned = state.drawCount === 1 ? 1 : WASTE_FANNED;
  const first = Math.max(0, state.waste.length - fanned);
  state.waste.forEach((card, i) => {
    placements[card] = {
      x: origin.x + Math.max(0, i - first) * m.wasteFan,
      y: origin.y,
      faceUp: true,
      z: Z_WASTE + i,
    };
  });
}

/**
 * Each card's vertical offset within its column. A column that would outgrow
 * the space compresses proportionally — the column squeezes, the board never
 * scrolls.
 */
export function columnOffsets(m: Metrics, column: Column): number[] {
  const offsets: number[] = [];
  let y = 0;
  for (let i = 0; i < column.cards.length; i++) {
    offsets.push(y);
    y += i < column.down ? m.fanDown : m.fanUp;
  }

  if (offsets.length < 2) return offsets;
  const spread = offsets[offsets.length - 1] as number;
  const overflow = spread + m.cardH - m.tableauH;
  if (overflow <= 0) return offsets;

  const squeeze = Math.max(0, spread - overflow) / spread;
  return offsets.map((offset) => offset * squeeze);
}

/** How tall a column stands on screen, compression included. */
export function columnHeight(m: Metrics, column: Column): number {
  if (column.cards.length === 0) return m.cardH;
  const offsets = columnOffsets(m, column);
  return (offsets[offsets.length - 1] as number) + m.cardH;
}

export interface Hit {
  ref: PileRef;
  /** Position within the pile, or `-1` for the empty slot itself. */
  index: number;
  card: Card | null;
}

/** Every pile on the board, in no particular order — hit-testing sorts by z itself. */
function allPiles(): PileRef[] {
  return [
    { pile: "stock" },
    { pile: "waste" },
    ...FOUNDATION_ORDER.map((suit): PileRef => ({ pile: "foundation", suit })),
    ...Array.from({ length: TABLEAU_COLUMNS }, (_, column): PileRef => ({
      pile: "tableau",
      column,
    })),
  ];
}

/**
 * What is under the pointer: the topmost card whose (padded) rectangle covers
 * the point, or the pile slot itself when the point is over an empty pile.
 *
 * Topmost wins ties, which is the only rule that makes a fanned column
 * tappable — every card but the last is mostly covered by the one above it.
 */
export function hitTest(
  m: Metrics,
  state: GameState,
  x: number,
  y: number,
): Hit | null {
  const placements = placeAll(m, state);
  const piles = allPiles();

  let best: Hit | null = null;
  let bestZ = -1;
  for (const ref of piles) {
    for (const [index, card] of pileCards(state, ref).entries()) {
      const at = placements[card] as Placement;
      if (!covers(m, at.x, at.y, x, y) || at.z <= bestZ) continue;
      best = { ref, index, card };
      bestZ = at.z;
    }
  }
  if (best !== null) return best;

  for (const ref of piles) {
    if (pileCards(state, ref).length > 0) continue;
    const origin = pileOrigin(m, ref);
    if (covers(m, origin.x, origin.y, x, y)) {
      return { ref, index: -1, card: null };
    }
  }
  return null;
}

function covers(
  m: Metrics,
  left: number,
  top: number,
  x: number,
  y: number,
): boolean {
  return (
    x >= left - HIT_PAD &&
    x <= left + m.cardW + HIT_PAD &&
    y >= top - HIT_PAD &&
    y <= top + m.cardH + HIT_PAD
  );
}

export function pileCards(state: GameState, ref: PileRef): readonly Card[] {
  switch (ref.pile) {
    case "stock":
      return state.stock;
    case "waste":
      return state.waste;
    case "foundation":
      return state.foundations[ref.suit] as Card[];
    case "tableau":
      return (state.tableau[ref.column] as Column).cards;
  }
}

/**
 * Where a dragged card is being dropped. The target is the pile whose
 * rectangle the *card's top-left corner region* overlaps most — not the pointer
 * position. With a 46px card and a fingertip, pointer-based targeting is wrong
 * constantly; see docs/05-interaction-and-motion.md.
 */
export function dropTarget(
  m: Metrics,
  state: GameState,
  x: number,
  y: number,
): PileRef | null {
  let best: PileRef | null = null;
  let bestArea = 0;

  for (const ref of allPiles()) {
    const origin = pileOrigin(m, ref);
    const height =
      ref.pile === "tableau"
        ? columnHeight(m, state.tableau[ref.column] as Column)
        : m.cardH;
    const area =
      overlap(x, x + m.cardW, origin.x, origin.x + m.cardW) *
      overlap(y, y + m.cardH, origin.y, origin.y + height);
    if (area > bestArea) {
      best = ref;
      bestArea = area;
    }
  }

  return best;
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/**
 * The measurements as CSS custom properties, so the server-rendered slots are
 * positioned from the same numbers the transforms use. The names are the
 * contract `src/styles/board.css` consumes.
 */
export function cssVariables(m: Metrics): Record<string, string> {
  return {
    "--card-w": `${m.cardW}px`,
    "--card-h": `${m.cardH}px`,
    "--gap": `${m.gap}px`,
    "--gutter": `${m.gutter}px`,
    "--row-gap": `${m.rowGap}px`,
    "--card-radius": `${m.radius}px`,
  };
}
