/**
 * Where a card is, inside a deck we did not draw.
 *
 * Not part of `astro build` and not part of `pnpm test`:
 *
 *     node scripts/deck-geometry.ts public/decks/plastic/deck.svg
 *     node scripts/deck-geometry.ts --verify
 *
 * The first prints the `grid` for a new deck's entry in src/decks/sourced.ts.
 * The second re-measures every deck already in that registry and fails if the
 * committed numbers no longer describe the file.
 *
 * ## Why this exists at all
 *
 * A sprite in the Aisleriot family lays its 52 cards out as a **contact
 * sheet** — thirteen ranks across, four suits down — so `<use href="#club_7">`
 * draws that card at its place on the sheet, not at the origin. To show one
 * card we point an `<svg>`'s viewBox at that card's rectangle, and something
 * has to know where the rectangle is.
 *
 * It could be worked out from the sheet's own viewBox divided by thirteen and
 * four. It is measured instead, because a sheet is not obliged to be a tidy
 * grid and several of them are not: some carry a fifth row for the back and
 * the jokers, some bleed their art outside the cell it nominally occupies, and
 * one card in one deck drags a stray element halfway down the file. Dividing
 * would give a plausible wrong answer for all of those. `getBBox()` in a real
 * browser gives the answer the browser will actually use.
 *
 * What is committed is the **lattice**, not 52 rectangles: an origin, a cell,
 * two steps and the row each suit sits on. Eight numbers per deck rather than
 * two hundred and eight, and a card that disagrees with the lattice is a
 * finding rather than a number to copy — see {@link fit}.
 *
 * ## The three traps
 *
 * - `getBBox()` returns zeros inside a `display:none` subtree. The sprite host
 *   the game injects *is* `display:none` (that is how a sprite works), so this
 *   script measures off-screen instead, and nothing here can be moved into the
 *   running game without hitting that.
 * - Ids collide. Two sprites in one document and `#club_7` resolves to
 *   whichever came first, silently. Each deck is measured in its own page.
 * - **A group's own transform is not in its own bbox.** Measuring
 *   `document.getElementById("club_7").getBBox()` reports where that group's
 *   contents are *before* the transform on the group, and the French sheet
 *   places every one of its 52 cards with exactly such a transform — so that
 *   measurement says "a contact sheet" about a deck that draws every card at
 *   the origin. What is measured here is a `<use>` of each id, which is the
 *   element the game itself draws, so the answer is the one the browser will
 *   act on rather than a fact about the file.
 */

import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { DECK_SIZE, cardName, rankOf, suitOf } from "../src/engine/index.ts";
import { SOURCED, type SourcedDeck, cardBox } from "../src/decks/sourced.ts";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How far a card may sit from the lattice before it is reported. Sheet units,
 * against cells that are 50 to 340 units wide — a quarter of a unit is well
 * inside "the same rectangle, written down differently".
 */
const TOLERANCE = 0.25;

const round = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Ids these sheets use for "a blank card", which is the deck's own statement
 * of the rectangle a card occupies. Not every deck has one, and the ones that
 * do are worth more than any amount of inference from where the ink lands —
 * a deck whose art bleeds past its own edge, as a drop shadow does, measures
 * wider than the card it is drawn on.
 */
const BASE_IDS = [
  "card",
  "base",
  "cf",
  "cardface",
  "card_face",
  "blank",
  // The back is a whole card too, and it is the only one of these that every
  // sprite in the registry has. See `ownCard`.
  "back",
];

async function measure(
  sprite: string,
): Promise<{ boxes: (Box | null)[]; bases: [string, Box][] }> {
  const svg = readFileSync(sprite, "utf8");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    // Off-screen rather than hidden: see the note on `getBBox()` above.
    await page.setContent(
      `<body style="margin:0"><div style="position:absolute;left:-99999px;top:0;width:1px;height:1px;overflow:hidden">${svg}</div></body>`,
    );
    const ids = [...Array(DECK_SIZE).keys()].map(symbolOf).concat("back");
    const all = await page.evaluate(
      ({ names, bases }: { names: string[]; bases: string[] }) => {
        const NS = "http://www.w3.org/2000/svg";
        const canvas = document.createElementNS(NS, "svg");
        canvas.setAttribute("width", "10");
        canvas.setAttribute("height", "10");
        document.body.append(canvas);
        // What the game draws is a `<use>`, so a `<use>` is what is measured:
        // it is the only thing that accounts for a transform on the group.
        const boxOf = (id: string): Box | null => {
          if (document.getElementById(id) === null) return null;
          const use = document.createElementNS(NS, "use");
          use.setAttribute("href", `#${id}`);
          canvas.append(use);
          const box = use.getBBox();
          use.remove();
          if (box.width === 0 || box.height === 0) return null;
          return { x: box.x, y: box.y, w: box.width, h: box.height };
        };
        return {
          boxes: names.map(boxOf),
          bases: bases.flatMap((id) => {
            const box = boxOf(id);
            return box === null ? [] : [[id, box] as [string, Box]];
          }),
        };
      },
      { names: ids, bases: BASE_IDS },
    );
    return all;
  } finally {
    await browser.close();
  }
}

/** The id convention every deck in this family shares. See sourced.ts. */
const SUITS = ["club", "diamond", "heart", "spade"] as const;
const COURTS = ["jack", "queen", "king"] as const;
function symbolOf(card: number): string {
  const rank = rankOf(card);
  return `${SUITS[suitOf(card)]}_${rank < 10 ? rank + 1 : COURTS[rank - 10]}`;
}

/** The middle value, which is the one an outlier cannot drag. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const half = sorted.length >> 1;
  return sorted.length % 2 === 0
    ? ((sorted[half - 1] as number) + (sorted[half] as number)) / 2
    : (sorted[half] as number);
}

/**
 * Fit a lattice to 52 measured boxes.
 *
 * Every statistic here is a median rather than a mean, and that is the whole
 * trick: one card with a stray element in it moves a mean and cannot move a
 * median, so a deck with one bad card still yields the right lattice — and
 * that card is then *reported* against it rather than quietly averaged in.
 */
function fit(boxes: (Box | null)[]): {
  grid: {
    x: number;
    y: number;
    w: number;
    h: number;
    dx: number;
    dy: number;
    rows: number[];
  };
  strays: string[];
} {
  const found = boxes.slice(0, DECK_SIZE);
  const present = found.filter((box): box is Box => box !== null);
  if (present.length === 0) throw new Error("no card in this sprite has a box");

  const w = median(present.map((box) => box.w));
  const h = median(present.map((box) => box.h));

  // The step between columns, taken from cards of the same suit, and between
  // rows, taken from cards of the same rank. A missing or broken card leaves a
  // gap of two steps, which the median ignores.
  const steps = (values: number[]): number => {
    const gaps = values
      .slice(1)
      .map((value, index) => value - (values[index] as number))
      .filter((step) => step > TOLERANCE);
    // No gap anywhere is not a failure: it is the French sheet, which draws
    // all 52 of its cards in the same place.
    return gaps.length === 0 ? 0 : median(gaps);
  };

  const columnXs: number[][] = [[], [], [], []];
  const rowYs: number[][] = [];
  for (let card = 0; card < DECK_SIZE; card++) {
    const box = found[card];
    if (box == null) continue;
    (columnXs[suitOf(card)] as number[]).push(box.x);
    (rowYs[rankOf(card)] ??= []).push(box.y);
  }
  const dx = median(columnXs.map((xs) => steps(xs)));
  const dy = median(rowYs.map((ys) => steps([...ys].sort((a, b) => a - b))));

  // The origin: where the ace of the first row sits, taken from all 52 cards
  // stepped back to column zero rather than from whichever card is first.
  const originX = median(
    [...Array(DECK_SIZE).keys()]
      .filter((card) => found[card] != null)
      .map((card) => (found[card] as Box).x - rankOf(card) * dx),
  );
  const suitRowY: number[] = [];
  for (let suit = 0; suit < 4; suit++) {
    const ys = [...Array(DECK_SIZE).keys()]
      .filter((card) => suitOf(card) === suit && found[card] != null)
      .map((card) => (found[card] as Box).y);
    suitRowY[suit] = median(ys);
  }
  const originY = Math.min(...suitRowY);
  const rows = suitRowY.map((y) => Math.round((y - originY) / (dy || 1)));

  const grid = {
    x: round(originX),
    y: round(originY),
    w: round(w),
    h: round(h),
    dx: round(dx),
    dy: round(dy),
    rows,
  };

  const strays: string[] = [];
  for (let card = 0; card < DECK_SIZE; card++) {
    const box = found[card];
    const want = {
      x: grid.x + rankOf(card) * grid.dx,
      y: grid.y + (grid.rows[suitOf(card)] as number) * grid.dy,
      w: grid.w,
      h: grid.h,
    };
    if (box == null) {
      strays.push(`${cardName(card)} has no box at all`);
      continue;
    }
    const off = Math.max(
      Math.abs(box.x - want.x),
      Math.abs(box.y - want.y),
      Math.abs(box.w - want.w),
      Math.abs(box.h - want.h),
    );
    if (off > TOLERANCE) {
      strays.push(
        `${cardName(card)} measures ${fmt(box)}, lattice says ${fmt(want)}`,
      );
    }
  }
  return { grid, strays };
}

const fmt = (box: Box): string =>
  `${round(box.x)} ${round(box.y)} ${round(box.w)} ${round(box.h)}`;

async function report(sprite: string): Promise<void> {
  const { boxes, bases } = await measure(sprite);
  const { grid, strays } = fit(boxes);
  const back = boxes[DECK_SIZE];
  console.log(`\n${sprite}`);
  console.log(
    `  grid: { x: ${grid.x}, y: ${grid.y}, w: ${grid.w}, h: ${grid.h}, dx: ${grid.dx}, dy: ${grid.dy}, rows: [${grid.rows.join(", ")}] },`,
  );
  console.log(
    back == null
      ? "  back: none in this sprite"
      : `  back: { x: ${round(back.x)}, y: ${round(back.y)}, w: ${round(back.w)}, h: ${round(back.h)} },`,
  );
  /*
   * The back is a free check on the lattice, and a sharp one. These sheets put
   * it in a fifth row, on the same grid as the faces — so if the steps are
   * right it lands on an exact cell, and if they are a unit out it does not.
   * That is how Minium's row step was caught: its cards' ink varies enough by
   * suit to make the median a unit too big, and the back does not care.
   */
  if (back != null && grid.dx > 0) {
    const col = (back.x - grid.x) / grid.dx;
    const row = (back.y - grid.y) / grid.dy;
    const onGrid =
      Math.abs(col - Math.round(col)) * grid.dx < 1 &&
      Math.abs(row - Math.round(row)) * grid.dy < 1;
    console.log(
      onGrid
        ? `  the back lands on cell ${Math.round(col)},${Math.round(row)} of that lattice — it agrees`
        : `  ! the back lands at ${col.toFixed(2)},${row.toFixed(2)} of that lattice, which is not a cell: the steps are wrong`,
    );
  }
  console.log(
    `  aspect: ${(grid.w / grid.h).toFixed(3)} of the drawn cell, ${(grid.dx / grid.dy || 0).toFixed(3)} of the step (a poker card is 0.714)`,
  );
  for (const [id, box] of bases) {
    console.log(`  the sheet's own #${id}: ${fmt(box)}`);
  }
  if (strays.length === 0) console.log("  every card sits on the lattice");
  else {
    console.log(`  ${strays.length} of 52 cards are off the lattice:`);
    for (const stray of strays.slice(0, 4)) console.log(`  ! ${stray}`);
    if (strays.length > 4) console.log(`  ! …and ${strays.length - 4} more`);
  }
}

/**
 * What `--verify` asserts, which is deliberately not "the committed numbers
 * equal the measured ones".
 *
 * They are not meant to be equal, in either direction. A committed box is
 * sometimes a **crop** of what is drawn — the French deck drops its own
 * printed border that way — and sometimes *larger* than what is drawn, because
 * the ink of a short suit does not reach the edges of the card it is printed
 * on. Requiring containment either way fails a deck that is perfectly correct.
 *
 * What would actually be a bug is a box pointed at the wrong part of the
 * sheet: one cell out, one row out, or a lattice whose steps have drifted
 * until the last column is off the end. So what is checked is that the two
 * boxes are **centred on the same thing**, within half a cell. Off by one
 * column is a whole step and fails loudly; art that bleeds past its own card,
 * or a card whose ink does not reach its own edges, moves the centre by
 * nothing at all and is ignored — which is right, because both are ordinary.
 */
const CENTRED_WITHIN = 0.5;

/**
 * The deck's own statement of how big a card is, out of {@link BASE_IDS} and
 * the back.
 *
 * The largest of them, by area, because some sheets use one of those ids for
 * something else — Plastic's `#cf` is a 21×22 corner flourish sitting beside a
 * 100×140 `#card` — and a card is the biggest thing any of these names is ever
 * given to.
 *
 * A blank **face** is preferred over the back, and only three decks here need
 * the back at all. The two are not always the same rectangle: Atlasnye draws
 * its back 0.58 units taller than any of its faces, which is nothing to look
 * at and enough to fail a comparison the faces should never have been part of.
 */
function ownCard(bases: [string, Box][]): [string, Box] | null {
  const faces = bases.filter(([id]) => id !== "back");
  let best: [string, Box] | null = null;
  for (const entry of faces.length > 0 ? faces : bases) {
    if (best === null || entry[1].w * entry[1].h > best[1].w * best[1].h) {
      best = entry;
    }
  }
  return best;
}

/**
 * How much smaller than its own card a committed cell may be. Nothing, to a
 * rounding error.
 *
 * This is the check the French deck needed and did not have. Its cell was
 * committed as a crop — 164.075 × 232.77 against a card of 166.575 × 242.14 —
 * on the reasoning that the deck's printed border was ours to drop. Eight of
 * those missing units are the bottom of the card, and what a Bellot card keeps
 * in its bottom eight units is the rotated index. Every face in the deck lost
 * both corner indices and all four edges of its border, at every size, on
 * every table, and {@link verify} said "all where the registry says" because
 * a crop and a card are centred on the same point.
 */
const CROP_TOLERANCE = 0.5;

async function verify(deck: SourcedDeck): Promise<string[]> {
  const { boxes, bases } = await measure(`public${deck.sprite}`);
  const wrong: string[] = [];

  const own = ownCard(bases);
  if (own === null) {
    wrong.push(`${deck.id}: the sprite names no blank card and no back`);
  } else {
    const [id, card] = own;
    const cell = deck.grid;
    if (cell.w < card.w - CROP_TOLERANCE || cell.h < card.h - CROP_TOLERANCE) {
      wrong.push(
        `${deck.id}: the committed cell is ${round(cell.w)}×${round(cell.h)}, ` +
          `inside the ${round(card.w)}×${round(card.h)} card the sheet draws as #${id} — ` +
          `that difference is card art that never reaches the screen`,
      );
    }
  }

  const seen = new Set<string>();
  for (let card = 0; card < DECK_SIZE; card++) {
    const drawn = boxes[card];
    const ours = cardBox(deck, card);
    if (drawn == null) {
      wrong.push(`${deck.id}: ${cardName(card)} draws nothing`);
      continue;
    }
    const key = `${ours.x},${ours.y}`;
    if (seen.has(key)) {
      // Only a real collision for a sheet that lays its cards out; the French
      // sheet draws all 52 in one place on purpose.
      if (deck.grid.dx !== 0) {
        wrong.push(`${deck.id}: ${cardName(card)} shares a cell with another`);
      }
    }
    seen.add(key);

    const offX = Math.abs(ours.x + ours.w / 2 - (drawn.x + drawn.w / 2));
    const offY = Math.abs(ours.y + ours.h / 2 - (drawn.y + drawn.h / 2));
    if (
      offX > (deck.grid.dx || ours.w) * CENTRED_WITHIN ||
      offY > (deck.grid.dy || ours.h) * CENTRED_WITHIN
    ) {
      wrong.push(
        `${deck.id}: ${cardName(card)} is committed as ${fmt(ours)}, which is not centred on the drawn ${fmt(drawn)}`,
      );
    }
  }
  return wrong;
}

const args = process.argv.slice(2);
if (args.includes("--verify")) {
  const wrong: string[] = [];
  for (const deck of SOURCED) {
    const found = await verify(deck);
    console.log(
      found.length === 0
        ? `${deck.id}: 52 cards, all where the registry says`
        : `${deck.id}: ${found.length} wrong`,
    );
    wrong.push(...found);
  }
  if (wrong.length > 0) {
    for (const line of wrong) console.error(`  ! ${line}`);
    process.exitCode = 1;
  }
} else if (args.length > 0) {
  for (const sprite of args) await report(sprite);
} else {
  console.error(
    "usage: node scripts/deck-geometry.ts <sprite.svg>... | --verify",
  );
  process.exitCode = 2;
}
