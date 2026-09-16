import { type Page, expect, test } from "@playwright/test";

import {
  type GameState,
  type Move,
  autoCompleteSequence,
  canAutoComplete,
  deal,
  hint,
} from "../src/engine/index.ts";
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
  // Fifty-two cards face up — the whole deck is home.
  await expect(page.locator(".card:not(.is-face-down)")).toHaveCount(52);

  // Winning starts the celebration rather than the panel: the veil only exists
  // during Stages 1 to 3. The sequence itself is exercised by `win.pw.ts`,
  // which can run it deterministically; what matters here is that a real win
  // reaches it at all.
  const veil = page.locator(".win-veil");
  await expect(veil).toBeVisible();
  await veil.tap();

  // The panel sits outside the board, so its buttons get their own clicks
  // rather than losing them to the board's pointer capture.
  const panel = page.getByRole("dialog", { name: "You won" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(`Deal #${SEED}`);

  // A first win on a deal beats nothing, so there is no record line — and no
  // line saying you missed one either, which would be a small punishment for
  // winning. What there is, is a win written down.
  await expect(
    panel.getByText(/Best time|Fewest moves|Fastest game/),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("sol:v1:stats") ?? "{}"),
    ),
  ).toMatchObject({ 1: { played: 1, won: 1 } });
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("sol:v1:records") ?? "{}"),
    ),
  ).toMatchObject({ deals: [{ seed: SEED, drawCount: 1 }] });
  // The finished game is not in progress any more.
  expect(
    await page.evaluate(() => localStorage.getItem("sol:v1:game")),
  ).toBeNull();

  await panel.getByRole("button", { name: "New deal" }).click();
  await expect(panel).toBeHidden();
  await expect(page.locator(".top-bar")).toContainText("0 moves");
});

/**
 * The other way a game ends, and the one most games actually end with: play
 * until every card is face up and the stock is spent, at which point the deal
 * is already won and the player is owed the ceremony rather than another forty
 * taps. docs/02-game-spec.md calls that condition a proof, and this is it
 * being taken at its word — the button appears exactly when it holds, and
 * pressing it sends the rest home and runs straight into the win sequence.
 */
const FINISHABLE = 20;

test("Finish plays out a deal that is already won", async ({ page }) => {
  test.setTimeout(180_000);

  const { moves } = playGreedily(deal(FINISHABLE, 1));
  let state = deal(FINISHABLE, 1);
  const gestures: Gesture[] = [];
  for (const move of moves) {
    if (canAutoComplete(state)) break;
    gestures.push(gestureFor(state, move));
    state = applyMove(state, move);
  }
  const rest = autoCompleteSequence(state);
  expect(rest.length).toBeGreaterThan(30);

  await page.goto(`/?deal=${FINISHABLE}`);
  await expect(page.locator(".card:not(.is-face-down)")).toHaveCount(7);

  const finish = page.getByRole("button", { name: "Finish" });
  const stock = page.locator(".slot-stock");
  for (const gesture of gestures) {
    // Never before the board has proved it cannot get stuck: a Finish that
    // sometimes stops halfway would be worse than none.
    await expect(finish).toHaveCount(0);
    if (gesture.card === null) {
      await stock.tap();
      continue;
    }
    const at = await coordinates(page, gesture);
    const [fx, fy] = (at as NonNullable<typeof at>).from;
    const [tx, ty] = (at as NonNullable<typeof at>).to;
    await page.mouse.move(fx, fy);
    await page.mouse.down();
    await page.mouse.move(tx, ty, { steps: 3 });
    await page.mouse.up();
  }

  await expect(finish).toBeVisible();
  await finish.click();

  await expect(page.locator(".top-bar")).toContainText(
    `${gestures.length + rest.length} moves`,
  );
  await expect(page.locator(".card:not(.is-face-down)")).toHaveCount(52);
  await expect(page.locator(".win-veil")).toBeVisible();
});

/**
 * The other thing a hint has to be able to say. docs/02-game-spec.md is exact
 * about it: "No moves left — undo, or try a new deal", said plainly, rather
 * than a "you lose" screen — there isn't one of those, because with unlimited
 * undo and unlimited redeals the player decides when a deal is over.
 *
 * Deal 357 walks into a dead end in thirty greedy moves, which is the cheapest
 * one of these the frozen deal mapping offers.
 */
const DEAD_END = 357;

test("a hint with nothing to point at says so", async ({ page }) => {
  const { moves } = playGreedily(deal(DEAD_END, 1));
  let state = deal(DEAD_END, 1);
  const gestures: Gesture[] = [];
  for (const move of moves) {
    if (hint(state) === null) break;
    gestures.push(gestureFor(state, move));
    state = applyMove(state, move);
  }
  expect(hint(state)).toBeNull();

  await page.goto(`/?deal=${DEAD_END}`);
  await expect(page.locator(".card:not(.is-face-down)")).toHaveCount(7);

  const stock = page.locator(".slot-stock");
  for (const gesture of gestures) {
    if (gesture.card === null) {
      await stock.tap();
      continue;
    }
    const at = await coordinates(page, gesture);
    const [fx, fy] = (at as NonNullable<typeof at>).from;
    const [tx, ty] = (at as NonNullable<typeof at>).to;
    await page.mouse.move(fx, fy);
    await page.mouse.down();
    await page.mouse.move(tx, ty, { steps: 3 });
    await page.mouse.up();
  }

  await page.getByRole("button", { name: "Hint" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "No moves left — undo, or try a new deal.",
  );
  await expect(page.locator(".card.is-hinting")).toHaveCount(0);

  // It leaves on its own, and undo is still right there.
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByRole("button", { name: /undo/i })).toBeEnabled();
});
