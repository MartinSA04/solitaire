/**
 * The pictures the deck gallery is browsed by: `public/decks/<id>/preview.webp`.
 *
 * Not part of `astro build` and not part of `pnpm test`:
 *
 *     node scripts/deck-previews.ts            # every sourced deck
 *     node scripts/deck-previews.ts plastic    # one of them
 *
 * ## Why there is a picture at all
 *
 * The gallery's whole purpose is that you look before you download. A deck
 * that showed itself only after you had chosen it would make the list a set of
 * names, and "Guyenne Classic, 186 KB" tells nobody anything. So three of each
 * deck's cards and the back it is printed on are rendered here, once, and
 * committed — four or five kilobytes each, fetched lazily and only when the
 * gallery is opened, against 3.5KB to 186KB for the deck itself.
 *
 * They are **derived works**: a picture made from somebody else's drawing. So
 * each one carries its deck's licence, sits in that deck's directory next to
 * the `LICENSE.txt` that says so, and is regenerated rather than retouched.
 *
 * ## What it draws
 *
 * The cards as the board draws them — the same `viewBox` per card out of
 * {@link cardBox}, the same `preserveAspectRatio="none"` fitting a deck's own
 * proportions to a poker card, the same rounded corners over the deck's own
 * paper. A preview that flattered a deck would be a lie about the thing being
 * chosen.
 *
 * The background is transparent, because the tile it sits on is a different
 * colour on each of the three tables.
 */

import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { cardOf } from "../src/engine/index.ts";
import {
  SOURCED,
  type SourcedDeck,
  cardBox,
  viewBox,
} from "../src/decks/sourced.ts";

/**
 * A court, a pip card and the back: the three things that differ between one
 * deck and another. A fourth card doubles the file and says nothing new.
 */
const SHOWN = [cardOf(3, 12), cardOf(1, 6)];

/** Card size in the preview, and how far each card is fanned over the last. */
const CARD_W = 72;
const CARD_H = 101;
const FAN = 41;

async function draw(deck: SourcedDeck): Promise<Buffer> {
  const svg = readFileSync(`public${deck.sprite}`, "utf8");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 400, height: 200 },
      deviceScaleFactor: 1.5,
    });
    await page.setContent("<body style='margin:0'><div id='out'></div></body>");
    await page.evaluate(
      ({ svg, faces, back, metrics }) => {
        const NS = "http://www.w3.org/2000/svg";
        // Not `display: none`: a gradient inside one does not paint. See the
        // note in src/game/DeckArt.ts, which is where that was found.
        const host = document.createElement("div");
        host.innerHTML = svg;
        host.style.cssText =
          "position:absolute;width:0;height:0;overflow:hidden";
        document.body.append(host);

        const out = document.getElementById("out") as HTMLElement;
        const shown = back === null ? faces : [...faces, back];
        out.style.cssText = `position:relative;width:${metrics.fan * (shown.length - 1) + metrics.w}px;height:${metrics.h}px`;
        shown.forEach((card, index) => {
          const holder = document.createElement("div");
          holder.style.cssText = `position:absolute;left:${index * metrics.fan}px;top:0;width:${metrics.w}px;height:${metrics.h}px;border-radius:${Math.round(metrics.w / 12)}px;overflow:hidden;background:${card.paper};box-shadow:0 1px 3px rgba(0,0,0,.35)`;
          const s = document.createElementNS(NS, "svg");
          s.setAttribute("viewBox", card.viewBox);
          s.setAttribute("preserveAspectRatio", "none");
          s.style.cssText = "width:100%;height:100%;display:block";
          const use = document.createElementNS(NS, "use");
          use.setAttribute("href", `#${card.symbol}`);
          s.append(use);
          holder.append(s);
          out.append(holder);
        });
      },
      {
        svg,
        faces: SHOWN.map((card) => ({
          viewBox: viewBox(cardBox(deck, card)),
          symbol: deck.symbol(card),
          paper: deck.paper,
        })),
        back:
          deck.back === null
            ? null
            : {
                viewBox: viewBox(deck.back),
                symbol: "back",
                paper: deck.paper,
              },
        metrics: { w: CARD_W, h: CARD_H, fan: FAN },
      },
    );
    const png = await page
      .locator("#out")
      .screenshot({ omitBackground: true, type: "png" });
    /*
     * WebP, encoded by the browser that just drew it.
     *
     * A 2x PNG of four cards is 30 to 60KB and the whole point of a preview is
     * that it is cheap; the same picture as WebP is four or five. Chromium has
     * an encoder and it is already open, so this costs no dependency — `sharp`
     * is in the tree as Astro's, not ours, and one script is a poor reason to
     * make it ours.
     */
    const base64 = await page.evaluate(
      async ({ data, quality }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        (canvas.getContext("2d") as CanvasRenderingContext2D).drawImage(
          image,
          0,
          0,
        );
        return canvas.toDataURL("image/webp", quality).split(",")[1] as string;
      },
      { data: png.toString("base64"), quality: 0.68 },
    );
    return Buffer.from(base64, "base64");
  } finally {
    await browser.close();
  }
}

const wanted = process.argv.slice(2);
const decks = SOURCED.filter(
  (deck) => wanted.length === 0 || wanted.includes(deck.id),
);
if (decks.length === 0) {
  console.error(`no sourced deck matches ${wanted.join(", ")}`);
  process.exitCode = 2;
}

for (const deck of decks) {
  const webp = await draw(deck);
  const path = `public/decks/${deck.id}/preview.webp`;
  writeFileSync(path, webp);
  console.log(`${path.padEnd(46)} ${(webp.length / 1024).toFixed(1)} KB`);
}
