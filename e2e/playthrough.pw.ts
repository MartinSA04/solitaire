import { type Page, expect, test } from "@playwright/test";

import { type GameState, type Move, deal } from "../src/engine/index.ts";
import { applyMove } from "../src/engine/moves.ts";
import { playGreedily } from "../test/engine/helpers.ts";

/**
 * Milestone 1's bar, mechanised: a complete game of Klondike, played from the
 * deal to the win through nothing but pointer events on the real built page.
 *
 * The line is not written down. It is played out by the greedy player from the
 * engine's own test scaffolding — which is why this can afford to be a *whole*
 * game rather than a scripted fragment — and every move it makes is translated
 * into the gesture a person would make to produce it. If the hit-testing, the
 * drop targeting, the turnover, the stock or the win detection is wrong
 * anywhere, the game stops being winnable and this fails.
 */

/** Any deal the greedy player can win. Frozen forever, like every deal number. */
const SEED = 30;

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

/** ♠ ♥ ♦ ♣ left to right, as the board is drawn. */
const FOUNDATION_SLOT = [3, 2, 1, 0];

/**
 * A move as a gesture: the card to pick up, and the slot to lay its top-left
 * corner on — which is what decides a drop, not where the finger is.
 * A `null` card means the stock, whose only gesture is a tap.
 */
interface Gesture {
  card: number | null;
  target: { foundation: boolean; index: number } | null;
}

function gestureFor(state: GameState, move: Move): Gesture {
  const slotOf = (card: number) =>
    FOUNDATION_SLOT.indexOf(Math.floor(card / 13));
  const wasteTop = state.waste[state.waste.length - 1] as number;

  switch (move.kind) {
    case "draw":
    case "recycle":
      return { card: null, target: null };
    case "wasteToTableau":
      return { card: wasteTop, target: { foundation: false, index: move.to } };
    case "wasteToFoundation":
      return {
        card: wasteTop,
        target: { foundation: true, index: slotOf(wasteTop) },
      };
    case "tableauToFoundation": {
      const cards = state.tableau[move.from]?.cards ?? [];
      const card = cards[cards.length - 1] as number;
      return { card, target: { foundation: true, index: slotOf(card) } };
    }
    case "tableauToTableau": {
      const cards = state.tableau[move.from]?.cards ?? [];
      return {
        card: cards[cards.length - move.count] as number,
        target: { foundation: false, index: move.to },
      };
    }
    default:
      throw new Error(`no gesture for ${move.kind}`);
  }
}

/**
 * Where to press and where to let go, in one round trip.
 *
 * The card's position is read from the transform the card layer *committed*,
 * not from its bounding box — a box is where a card happens to be partway
 * through a transition, and this needs where the game has decided it belongs.
 *
 * The grab is near the card's top edge because in a fanned column that strip
 * is the only part of a buried card that is on top of anything, and the same
 * offset at the target lands its corner on the slot.
 */
async function coordinates(page: Page, gesture: Gesture) {
  return page.evaluate((g) => {
    const card = document.querySelector<HTMLElement>(
      `.card[data-card="${g.card}"]`,
    );
    const slots = document.querySelectorAll(
      g.target?.foundation ? ".slot-foundation" : ".slot-column",
    );
    const slot = slots[g.target?.index ?? 0];
    if (card === null || slot === undefined) return null;

    const at = /translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(
      card.style.transform,
    );
    const board = (
      document.querySelector(".board") as HTMLElement
    ).getBoundingClientRect();
    if (at === null) return null;

    const grabY = card.offsetHeight / 12;
    const to = slot.getBoundingClientRect();
    return {
      from: [
        board.x + Number(at[1]) + card.offsetWidth / 2,
        board.y + Number(at[2]) + grabY,
      ] as const,
      to: [to.x + to.width / 2, to.y + grabY] as const,
    };
  }, gesture);
}

test("a whole game, dealt to won, by pointer alone", async ({ page }) => {
  // Two hundred-odd gestures, each a handful of round trips.
  test.setTimeout(180_000);

  const { moves } = playGreedily(deal(SEED, 1));
  let state = deal(SEED, 1);
  const gestures = moves.map((move) => {
    const gesture = gestureFor(state, move);
    state = applyMove(state, move);
    return gesture;
  });

  await page.goto(`/?deal=${SEED}`);
  await expect(page.locator(".card:not(.is-face-down)")).toHaveCount(7);

  const stock = page.locator(".slot-stock");
  for (const [index, gesture] of gestures.entries()) {
    if (gesture.card === null) {
      await stock.tap();
      continue;
    }

    const at = await coordinates(page, gesture);
    expect(at, `move ${index} had nothing to grab`).not.toBeNull();
    const [fx, fy] = (at as NonNullable<typeof at>).from;
    const [tx, ty] = (at as NonNullable<typeof at>).to;

    await page.mouse.move(fx, fy);
    await page.mouse.down();
    await page.mouse.move(tx, ty, { steps: 3 });
    await page.mouse.up();
  }

  // Every gesture landed: the counter is the move list's own length.
  await expect(page.locator(".top-bar")).toContainText(`${moves.length} moves`);
  await expect(page.getByRole("dialog", { name: "You won" })).toBeVisible();
  // Fifty-two cards face up — the whole deck is home.
  await expect(page.locator(".card:not(.is-face-down)")).toHaveCount(52);

  // The panel sits outside the board, so its button gets its own clicks rather
  // than losing them to the board's pointer capture.
  await page.getByRole("dialog").getByRole("button").click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator(".top-bar")).toContainText("0 moves");
});
