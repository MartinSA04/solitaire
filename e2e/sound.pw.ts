import { type Locator, type Page, expect, test } from "@playwright/test";

/**
 * The sound, as far as a test can hear it.
 *
 * Nothing here judges how anything sounds — that is what ears are for. What it
 * checks is the three claims docs/07-architecture.md makes that are facts
 * rather than taste: the context is built on a gesture and not before, a card
 * moving is a noise burst, and a card going home is a note instead.
 *
 * It counts nodes rather than listening, by standing a counting subclass in
 * front of `AudioContext` before the page runs. A headless browser has no
 * speakers; the graph is built all the same.
 */

const DEAL = "/?deal=24";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

interface Heard {
  contexts: number;
  bursts: number;
  tones: number;
}

async function listen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const heard = { contexts: 0, bursts: 0, tones: 0 };
    Object.defineProperty(window, "__heard", { value: heard });

    const Real = window.AudioContext;
    class Counting extends Real {
      constructor() {
        super();
        heard.contexts++;
      }
      override createBufferSource(): AudioBufferSourceNode {
        heard.bursts++;
        return super.createBufferSource();
      }
      override createOscillator(): OscillatorNode {
        heard.tones++;
        return super.createOscillator();
      }
    }
    Object.defineProperty(window, "AudioContext", { value: Counting });
  });
}

function heard(page: Page): Promise<Heard> {
  return page.evaluate(() => ({
    ...(window as unknown as { __heard: Heard }).__heard,
  }));
}

function card(page: Page, id: number): Locator {
  return page.locator(`.card[data-card="${id}"]`);
}

/** A♥ — the top of the rightmost column on this deal. */
const ACE_OF_HEARTS = 2 * 13 + 0;

async function tapCard(page: Page, target: Locator): Promise<void> {
  const box = await target.boundingBox();
  if (box === null) throw new Error("element has no box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await listen(page);
  await page.goto(DEAL);
  await expect(page.locator(".card:not(.is-face-down)")).toHaveCount(7);
  await expect(page.locator(".card.is-moving")).toHaveCount(0);
});

test("the deal is silent, and builds no context to be silent in", async ({
  page,
}) => {
  // A visit that never plays should cost nothing: no audio thread, no battery,
  // and — since the deal runs on load, before any gesture — no noise.
  expect(await heard(page)).toEqual({ contexts: 0, bursts: 0, tones: 0 });
});

test("the first card the player moves makes a noise", async ({ page }) => {
  await page.locator(".slot-stock").tap();
  await expect(page.locator(".top-bar")).toContainText("1 move");

  const after = await heard(page);
  expect(after.contexts).toBe(1);
  expect(after.bursts).toBe(1);
  // A slide is noise, not a note.
  expect(after.tones).toBe(0);
});

test("a run of moves is a run of bursts, and only one context", async ({
  page,
}) => {
  const stock = page.locator(".slot-stock");
  for (let i = 0; i < 5; i++) await stock.tap();

  const after = await heard(page);
  expect(after.bursts).toBe(5);
  expect(after.contexts).toBe(1);
});

test("a card going home gets a note instead of a slide", async ({ page }) => {
  await tapCard(page, card(page, ACE_OF_HEARTS));
  await expect(page.locator(".top-bar")).toContainText("1 move");

  const after = await heard(page);
  expect(after.tones).toBe(1);
  // The ping replaces the slide rather than joining it; two at once is mud.
  expect(after.bursts).toBe(0);
});
