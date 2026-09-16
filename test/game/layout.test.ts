import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type Card,
  CLUBS,
  DECK_SIZE,
  DIAMONDS,
  HEARTS,
  SPADES,
  TABLEAU_COLUMNS,
  deal,
} from "../../src/engine/index.ts";
import {
  type Metrics,
  type Placement,
  FOUNDATION_ORDER,
  HIT_PAD,
  columnHeight,
  columnOffsets,
  dropTarget,
  hitTest,
  metricsFor,
  pageOf,
  pageShift,
  pileOrigin,
  placeAll,
} from "../../src/game/Layout.ts";
import { makeState } from "../engine/helpers.ts";

/**
 * Layout is the one part of the UI that is pure arithmetic, so it is the one
 * part that can be pinned without a browser. The golden viewports are the four
 * docs/07-architecture.md names, with the top and bottom bars already taken
 * off the height — this module is given the board's area, not the window's.
 */

const PHONE = { width: 360, height: 680 };
const PHONE_LARGE = { width: 390, height: 744 };
const TABLET = { width: 768, height: 924 };
const DESKTOP = { width: 1440, height: 800 };

/** A column of six face-down cards under a full K→A run: the longest Klondike can deal. */
const WORST_COLUMN = {
  cards: Array.from({ length: 19 }, (_, i) => i as Card),
  down: 6,
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

describe("board measurements", () => {
  it("hits the phone sizing table in docs/05 on a 360px viewport", () => {
    const m = metricsFor(PHONE);
    // "Card width (100vw - 16 - 24) / 7 ≈ 46px — the binding constraint on
    // everything", and the gutter, gap and fans that follow from it.
    assert.equal(Math.round(m.cardW), 46);
    assert.equal(Math.round(m.cardH), 64);
    assert.equal(Math.round(m.gutter), 8);
    assert.equal(Math.round(m.gap), 4);
    assert.equal(Math.round(m.fanDown), 9);
    assert.equal(Math.round(m.fanUp), 19);
  });

  it("keeps the golden values", () => {
    assert.deepEqual(
      [PHONE, PHONE_LARGE, TABLET, DESKTOP].map((area) => {
        const m = metricsFor(area);
        return [round(m.cardW), round(m.gap), round(m.originX)];
      }),
      [
        [45.74, 3.98, 7.96],
        [49.56, 4.31, 8.62],
        [97.59, 8.49, 16.98],
        [110, 9.57, 306.29],
      ],
    );
  });

  it("stops growing at 110px and gives the leftover width to the table", () => {
    const m = metricsFor({ width: 2560, height: 1200 });
    assert.equal(m.cardW, 110);
    // Past the cap the board is centred rather than stretched — extra room
    // becomes table, which is the point of having a nice table.
    assert.ok(m.originX > m.gutter);
  });

  it("centres the board, so the grid and the transforms agree", () => {
    for (const area of [PHONE, PHONE_LARGE, TABLET, DESKTOP]) {
      const m = metricsFor(area);
      assert.ok(Math.abs(m.originX * 2 + m.boardW - area.width) < 1e-9);
    }
  });

  it("fits seven columns plus gutters exactly while width is the constraint", () => {
    const m = metricsFor(PHONE);
    const used =
      2 * m.gutter + TABLEAU_COLUMNS * m.cardW + (TABLEAU_COLUMNS - 1) * m.gap;
    assert.ok(Math.abs(used - PHONE.width) < 1e-9);
  });

  it("fits the worst column the game can deal, at every size", () => {
    // The board never scrolls. Ever. This is the assertion that makes that
    // unconditional rather than usually true.
    for (const area of [PHONE, PHONE_LARGE, TABLET, DESKTOP]) {
      const m = metricsFor(area);
      assert.ok(
        columnHeight(m, WORST_COLUMN) <= m.tableauH + 1e-9,
        `a 19-card column overflows at ${area.width}x${area.height}`,
      );
    }
  });

  it("compresses a column rather than letting it overflow", () => {
    // A deliberately short board: the fan has to give.
    const m = metricsFor({ width: 360, height: 240 });
    const loose = columnOffsets(m, { cards: [0, 1, 2], down: 0 });
    const tight = columnOffsets(m, WORST_COLUMN);
    assert.equal(loose[1], m.fanUp);
    assert.ok((tight[1] as number) < m.fanUp);
    assert.ok(columnHeight(m, WORST_COLUMN) <= m.tableauH + 1e-9);
  });
});

describe("peeking a column", () => {
  const m = metricsFor(PHONE);
  /** Three buried cards under two face-up ones — an ordinary mid-game column. */
  const BURIED = { cards: [0, 1, 2, 3, 4], down: 3 };

  it("gives every card the face-up fan, face-down ones included", () => {
    const open = columnOffsets(m, BURIED, true);
    for (const [i, offset] of open.entries()) {
      assert.ok(Math.abs(offset - i * m.fanUp) < 1e-9, `card ${i}`);
    }
  });

  it("opens the column rather than moving it", () => {
    const shut = columnOffsets(m, BURIED);
    const open = columnOffsets(m, BURIED, true);
    // The card you pressed on stays put and everything under it comes down:
    // a peek that slid the whole column would lose your place in it.
    assert.equal(open[0], shut[0]);
    assert.ok((open[4] as number) > (shut[4] as number));
  });

  it("still cannot push a column off the board", () => {
    // The compression is what makes that true, and a peek goes through it
    // like every other fan.
    const short = metricsFor({ width: 360, height: 240 });
    const open = columnOffsets(short, WORST_COLUMN, true);
    const last = open[open.length - 1] as number;
    assert.ok(last + short.cardH <= short.tableauH + 1e-9);
  });

  it("is the whole of what placeAll does differently", () => {
    const state = deal(24, 1);
    const shut = placeAll(m, state);
    const open = placeAll(m, state, 6);

    const rightmost = (state.tableau[6] as { cards: Card[] }).cards;
    assert.ok(
      (open[rightmost[6] as Card] as Placement).y >
        (shut[rightmost[6] as Card] as Placement).y,
    );
    // Every other column is exactly where it was.
    const elsewhere = (state.tableau[0] as { cards: Card[] }).cards[0] as Card;
    assert.deepEqual(open[elsewhere], shut[elsewhere]);
  });
});

describe("pile positions", () => {
  const m = metricsFor(PHONE);
  const columnX = (n: number): number => m.originX + n * (m.cardW + m.gap);

  it("puts the stock and waste in the first two columns", () => {
    assert.deepEqual(pileOrigin(m, { pile: "stock" }), {
      x: columnX(0),
      y: 0,
    });
    assert.deepEqual(pileOrigin(m, { pile: "waste" }), {
      x: columnX(1),
      y: 0,
    });
  });

  it("puts the foundations in columns 3-6, spades first", () => {
    // ♠ ♥ ♦ ♣, left to right, as docs/02-game-spec.md draws the board.
    assert.deepEqual(FOUNDATION_ORDER, [SPADES, HEARTS, DIAMONDS, CLUBS]);
    FOUNDATION_ORDER.forEach((suit, slot) => {
      assert.deepEqual(pileOrigin(m, { pile: "foundation", suit }), {
        x: columnX(3 + slot),
        y: 0,
      });
    });
  });

  it("leaves column 2 empty, between the waste and the foundations", () => {
    const occupied = [
      pileOrigin(m, { pile: "stock" }).x,
      pileOrigin(m, { pile: "waste" }).x,
      ...FOUNDATION_ORDER.map(
        (suit) => pileOrigin(m, { pile: "foundation", suit }).x,
      ),
    ];
    assert.ok(!occupied.some((x) => Math.abs(x - columnX(2)) < 1e-9));
  });

  it("starts the tableau below the top row", () => {
    assert.equal(pileOrigin(m, { pile: "tableau", column: 0 }).y, m.tableauY);
    assert.ok(m.tableauY > m.cardH);
  });
});

describe("placing a dealt position", () => {
  const m = metricsFor(PHONE);
  const state = deal(12345, 1);
  const placements = placeAll(m, state);

  it("places all 52 cards, once each", () => {
    assert.equal(placements.length, DECK_SIZE);
    assert.equal(placements.filter((p) => p !== undefined).length, DECK_SIZE);
  });

  it("stacks the stock square, face down, at the stock slot", () => {
    const origin = pileOrigin(m, { pile: "stock" });
    for (const card of state.stock) {
      const at = placements[card] as Placement;
      assert.deepEqual([at.x, at.y, at.faceUp], [origin.x, origin.y, false]);
    }
  });

  it("fans each column and turns over only its last card", () => {
    state.tableau.forEach((column, index) => {
      const origin = pileOrigin(m, { pile: "tableau", column: index });
      column.cards.forEach((card, i) => {
        const at = placements[card] as Placement;
        assert.equal(at.x, origin.x);
        assert.equal(at.faceUp, i === column.cards.length - 1);
      });
      const top = placements[
        column.cards[column.cards.length - 1] as Card
      ] as Placement;
      assert.equal(top.y, origin.y + column.down * m.fanDown);
    });
  });

  it("stacks the draw-1 waste square and fans only the last three in draw-3", () => {
    const square = makeState({ waste: "A♣ 2♣ 3♣ 4♣", drawCount: 1 });
    const squarePlaced = placeAll(m, square);
    const xs = square.waste.map((card) => (squarePlaced[card] as Placement).x);
    assert.equal(new Set(xs).size, 1);

    const fanned = makeState({ waste: "A♣ 2♣ 3♣ 4♣", drawCount: 3 });
    const fannedPlaced = placeAll(m, fanned);
    const base = (fannedPlaced[fanned.waste[0] as Card] as Placement).x;
    const offsets = fanned.waste.map((card) =>
      round((fannedPlaced[card] as Placement).x - base),
    );
    assert.deepEqual(offsets, [0, 0, round(m.wasteFan), round(2 * m.wasteFan)]);
  });

  it("stacks a card flying to a foundation above every column it crosses", () => {
    // Pile bands: tableau lowest, foundations highest, so the flight passes
    // over columns 3-7 rather than under them.
    const column = placements[
      (state.tableau[6] as { cards: Card[] }).cards[0] as Card
    ] as Placement;
    const home = placeAll(m, makeState({ foundations: "A♠" }));
    assert.ok((home[0 + 3 * 13] as Placement).z > column.z);
  });
});

describe("hit-testing", () => {
  const m = metricsFor(PHONE);

  it("finds the topmost card of a fanned column", () => {
    const state = makeState({ tableau: ["A♣ 2♣ | 5♠ 4♥ 3♠"] });
    const origin = pileOrigin(m, { pile: "tableau", column: 0 });
    // Well inside the last card, which overlaps the four beneath it.
    const y = origin.y + 2 * m.fanDown + 2 * m.fanUp + m.cardH / 2;
    const hit = hitTest(m, state, origin.x + m.cardW / 2, y);
    assert.deepEqual(hit?.ref, { pile: "tableau", column: 0 });
    assert.equal(hit?.index, 4);
  });

  it("finds a buried card by its visible strip", () => {
    const state = makeState({ tableau: ["A♣ 2♣ | 5♠ 4♥ 3♠"] });
    const origin = pileOrigin(m, { pile: "tableau", column: 0 });
    const offsets = columnOffsets(m, state.tableau[0] as never);
    const y = (origin.y + (offsets[3] as number) + m.fanUp / 2) as number;
    const hit = hitTest(m, state, origin.x + m.cardW / 2, y);
    assert.equal(hit?.index, 3);
  });

  it("reports the slot itself for an empty pile", () => {
    const state = makeState({});
    const origin = pileOrigin(m, { pile: "tableau", column: 3 });
    const hit = hitTest(m, state, origin.x + 1, origin.y + 1);
    assert.deepEqual(hit, {
      ref: { pile: "tableau", column: 3 },
      index: -1,
      card: null,
    });
  });

  it("overruns the card by a few pixels, so a 46px target is forgiving", () => {
    const state = makeState({ tableau: ["K♠"] });
    const origin = pileOrigin(m, { pile: "tableau", column: 0 });
    const justOutside = origin.x - HIT_PAD + 1;
    assert.equal(hitTest(m, state, justOutside, origin.y + 2)?.index, 0);
    assert.equal(hitTest(m, state, origin.x - HIT_PAD - 2, origin.y + 2), null);
  });

  it("is null over bare table", () => {
    const state = makeState({});
    // The gap column between the waste and the foundations.
    const x = m.originX + 2 * (m.cardW + m.gap) + m.cardW / 2;
    assert.equal(hitTest(m, state, x, m.cardH / 2), null);
  });
});

describe("drop targeting", () => {
  const m = metricsFor(PHONE);

  it("picks the pile the dragged card overlaps most, not the one under the pointer", () => {
    const state = makeState({ tableau: ["K♠", "", "", "", "", "", ""] });
    const second = pileOrigin(m, { pile: "tableau", column: 1 });
    // The card's corner sits just left of column 1, so most of it is over
    // column 1 rather than column 0.
    const target = dropTarget(m, state, second.x - m.gap, second.y + 4);
    assert.deepEqual(target, { pile: "tableau", column: 1 });
  });

  it("targets a tall column anywhere down its length", () => {
    const state = makeState({ tableau: ["A♣ 2♣ | 5♠ 4♥ 3♠"] });
    const origin = pileOrigin(m, { pile: "tableau", column: 0 });
    const low = origin.y + columnHeight(m, state.tableau[0] as never) - m.cardH;
    assert.deepEqual(dropTarget(m, state, origin.x, low), {
      pile: "tableau",
      column: 0,
    });
  });

  it("is null when the card is nowhere near a pile", () => {
    const state = makeState({});
    const x = m.originX + 2 * (m.cardW + m.gap);
    assert.equal(dropTarget(m, state, x, 0), null);
  });
});

/** Not exported, but every test above depends on it being the same shape. */
function _typecheck(m: Metrics): number {
  return m.cardW;
}
void _typecheck;

/**
 * The Large card size, from docs/08-accessibility.md: cards a third bigger,
 * bought by showing fewer columns at once and paging sideways for the rest.
 *
 * Everything here is arithmetic, so all of it can be pinned without a browser
 * — including the part the design did not foresee, which is that a card too
 * big for seven columns is also too big for the six piles in the top row.
 */
describe("the Large card size", () => {
  it("buys a third more card on a phone, and pays in columns", () => {
    const comfortable = metricsFor(PHONE_LARGE);
    const large = metricsFor(PHONE_LARGE, "large");

    assert.equal(comfortable.visibleColumns, TABLEAU_COLUMNS);
    assert.equal(large.visibleColumns, 5);
    assert.ok(
      large.cardW / comfortable.cardW > 1.3,
      `only ${((large.cardW / comfortable.cardW - 1) * 100).toFixed(0)}% bigger`,
    );
    assert.equal(large.pages, 2);
  });

  it("wraps the top row exactly when the tableau pages", () => {
    for (const area of [PHONE, PHONE_LARGE, TABLET, DESKTOP]) {
      for (const size of ["comfortable", "large"] as const) {
        const m = metricsFor(area, size);
        assert.equal(
          m.topRows > 1,
          m.pages > 1,
          `${size} at ${area.width}×${area.height}`,
        );
      }
    }
  });

  it("is only ever five, six or seven columns across", () => {
    // src/styles/board.css spells the two wrapped counts out, because
    // `repeat()` will not take a custom property. This is what says there are
    // only two of them to spell.
    const widths = [280, 320, 360, 390, 430, 540, 768, 834, 1024, 1440, 2560];
    for (const width of widths) {
      for (const height of [560, 680, 744, 900, 1180]) {
        for (const size of ["comfortable", "large"] as const) {
          const m = metricsFor({ width, height }, size);
          assert.ok(
            m.visibleColumns >= 5 && m.visibleColumns <= TABLEAU_COLUMNS,
            `${m.visibleColumns} columns at ${width}×${height} ${size}`,
          );
          if (m.topRows > 1) {
            assert.ok(
              m.visibleColumns === 5 || m.visibleColumns === 6,
              `wrapped at ${m.visibleColumns} columns, which board.css cannot draw`,
            );
          }
        }
      }
    }
  });

  it("changes nothing on a board wide enough to hold every column", () => {
    // A desktop is already at the 110px cap with all seven on screen, so there
    // is nothing for the setting to buy and nothing to page through.
    const comfortable = metricsFor(DESKTOP);
    const large = metricsFor(DESKTOP, "large");
    assert.equal(large.cardW, comfortable.cardW);
    assert.equal(large.visibleColumns, TABLEAU_COLUMNS);
    assert.equal(large.pages, 1);
    assert.equal(large.topRows, 1);
    assert.equal(pageShift(large), 0);
  });

  it("keeps the stock, the waste and the foundations still while it pages", () => {
    const first = metricsFor(PHONE_LARGE, "large", 0);
    const second = metricsFor(PHONE_LARGE, "large", 1);
    for (const ref of [
      { pile: "stock" } as const,
      { pile: "waste" } as const,
      ...FOUNDATION_ORDER.map(
        (suit) => ({ pile: "foundation", suit }) as const,
      ),
    ]) {
      assert.deepEqual(
        pileOrigin(second, ref),
        pileOrigin(first, ref),
        `${ref.pile} moved`,
      );
    }
    // And the tableau did move, by exactly the two columns the page is worth.
    const shift = pageShift(second);
    assert.equal(
      Math.round(shift),
      Math.round(2 * (second.cardW + second.gap)),
    );
    assert.equal(
      Math.round(pileOrigin(first, { pile: "tableau", column: 0 }).x - shift),
      Math.round(pileOrigin(second, { pile: "tableau", column: 0 }).x),
    );
  });

  it("puts the last column flush with the right edge on the last page", () => {
    const last = metricsFor(PHONE_LARGE, "large", 1);
    const right =
      pileOrigin(last, { pile: "tableau", column: TABLEAU_COLUMNS - 1 }).x +
      last.cardW;
    assert.equal(Math.round(right), Math.round(last.originX + last.boardW));
  });

  it("knows which page a column is on, and clamps a page it does not have", () => {
    const m = metricsFor(PHONE_LARGE, "large");
    for (const column of [0, 1, 2, 3, 4]) assert.equal(pageOf(m, column), 0);
    for (const column of [5, 6]) assert.equal(pageOf(m, column), 1);

    assert.equal(metricsFor(PHONE_LARGE, "large", 9).page, 1);
    assert.equal(metricsFor(PHONE_LARGE, "large", -3).page, 0);
    assert.equal(metricsFor(PHONE_LARGE, "comfortable", 1).page, 0);
  });

  it("still fits the worst column the game can deal", () => {
    // The board never scrolls *vertically*, whatever the cards are doing
    // sideways: the extra top row has to come out of somewhere, and it comes
    // out of space a phone had spare.
    for (const area of [PHONE, PHONE_LARGE, TABLET]) {
      const m = metricsFor(area, "large");
      assert.ok(
        columnHeight(m, WORST_COLUMN) <= m.tableauH + 0.5,
        `a 19-card column overflows at ${area.width}×${area.height}`,
      );
    }
  });

  it("hit-tests and drops against the page that is showing", () => {
    const m = metricsFor(PHONE_LARGE, "large", 1);
    const state = makeState({ tableau: ["", "", "", "", "", "", "K♠"] });
    const seventh = pileOrigin(m, { pile: "tableau", column: 6 });

    // Column seven is only reachable at all on the second page.
    const hit = hitTest(m, state, seventh.x + 4, seventh.y + 4);
    assert.deepEqual(hit?.ref, { pile: "tableau", column: 6 });
    assert.deepEqual(dropTarget(m, state, seventh.x, seventh.y), {
      pile: "tableau",
      column: 6,
    });
  });
});
