# 04 — Art direction

Three table themes, several decks, one coherent system. The player picks; nothing
is locked, purchased, or unlocked by playing.

The card *art* is sourced from open-licensed decks rather than drawn for this
project. Everything around the cards — table, backs, layout, type, light, motion —
is ours, and is where the identity actually lives.

## The system

A theme is a set of CSS custom properties on `:root`, plus a choice of deck. Nothing
in the layout or the engine knows which theme is active.

```text
theme = surface tokens + light model + type + a default deck
deck  = 52 card faces + a back  (independently swappable)
```

Any deck works on any table. That's the point: someone can have the dark table with
the classic deck if that's what they like, and we don't have an opinion.

### Token contract

Every theme defines exactly this set. A theme that doesn't is incomplete and fails a
test.

```css
--table-bg           /* the felt/ground itself, may be a gradient */
--table-texture      /* an optional overlay image or none */
--table-vignette     /* radial darkening at the edges, or none */
--slot-stroke        /* the empty-pile outline */
--slot-fill          /* the empty-pile interior */
--card-radius
--card-shadow-rest   /* card lying on the table */
--card-shadow-lift   /* card held by the pointer */
--card-stroke        /* card edge, for contrast on similar backgrounds */
--accent             /* legal-drop highlight, focus ring, primary button */
--accent-contrast    /* text on --accent */
--chrome-bg          /* top bar and bottom bar */
--chrome-fg
--chrome-fg-dim      /* the clock and move counter at rest */
--sheet-bg           /* settings/stats panels */
--win-bloom          /* the colour the win sequence explodes in */
--win-trail-blend    /* source-over, or lighter on a table dark enough for it */
```

`--win-trail-blend` is how the [cascade](06-win-sequence.md)'s trails
composite. A dark table sets it to `lighter`, which is where the "firework"
reading comes from; on a light or mid table additive trails blow out to white,
so those leave it at `source-over`. It is a theme's decision, which is why it
is a token rather than a flag in the canvas code.

Two hard constraints on any theme, checked in review:

- A face-up card must reach **4.5:1** contrast against the table.
- The legal-drop highlight must be distinguishable **without relying on hue** — it
  changes lightness and adds a border, not just a colour. See
  [08 — Accessibility](08-accessibility.md).

## The three tables

### 1. Warm modern classic — *default*

```text
┌──────────────────────────────────────┐
│  ▓▓ deep felt, soft vignette         │
│  ┌───┐ ┌───┐     ┌───┐┌───┐┌───┐┌───┐│
│  │▚▚▚│ │A♠ │     │   ││   ││   ││   ││
│  └───┘ └───┘     └───┘└───┘└───┘└───┘│
│                                      │
│  ┌───┐┌───┐┌───┐┌───┐┌───┐┌───┐┌───┐ │
│  │▚▚▚││▚▚▚││▚▚▚││▚▚▚││▚▚▚││▚▚▚││▚▚▚│ │
│  └─┬─┘└─┬─┘└─┬─┘└─┬─┘└─┬─┘└─┬─┘└─┬─┘ │
│   warm shadows · 8px radius          │
└──────────────────────────────────────┘
```

What people picture when they picture solitaire, redrawn by someone who has seen a
screen made after 1998.

- **Table**: a deep desaturated green (`#1E4636` → `#173528` radial), fine woven
  felt texture at ~6% opacity, strong vignette. Warm, not fluorescent.
- **Light**: a single soft key from above-left. Cards cast a real offset shadow
  (`0 1px 2px` at rest, `0 12px 28px` when lifted). This is the theme where depth is
  the point.
- **Accent**: warm brass `#C89B3C`.
- **Type**: a humanist serif for the clock and headings; the deck supplies the card
  faces.
- **Default deck**: Classic.

### 2. Minimal Scandinavian

```text
┌──────────────────────────────────────┐
│  flat sand / slate ground            │
│  ┌───┐ ┌───┐     ┌ ─┐┌ ─┐┌ ─┐┌ ─┐    │
│  │   │ │A  │     │  ││  ││  ││  │    │
│  └───┘ └───┘     └ ─┘└ ─┘└ ─┘└ ─┘    │
│                                      │
│  ┌───┐┌───┐┌───┐┌───┐┌───┐┌───┐┌───┐ │
│  │   ││   ││   ││   ││   ││   ││   │ │
│  └─┬─┘└─┬─┘└─┬─┘└─┬─┘└─┬─┘└─┬─┘└─┬─┘ │
│   no shadow · 1.5px hairlines        │
└──────────────────────────────────────┘
```

For people who find the green felt kitsch. Cards as typographic objects on a flat
ground.

- **Table**: flat. Light mode `#EDE8E0` (warm paper); dark mode `#1A1C1E`
  (slate). This theme respects `prefers-color-scheme`; the other two don't, because
  they *are* a light choice.
- **Light**: none. No shadows at all at rest. Depth is communicated by a 1.5px
  hairline border and, when a card is lifted, a very slight scale and a single
  soft shadow — the only shadow in the theme, which makes it read loudly.
- **Accent**: a muted terracotta `#B5613F` (light) / dusty blue `#7FA1C4` (dark).
- **Type**: a geometric grotesque throughout, tabular figures for the clock.
- **Default deck**: Minimal.

### 3. Dark premium

```text
┌──────────────────────────────────────┐
│  ██ near-black · radial glow         │
│  ┌───┐ ┌───┐     ┌───┐┌───┐┌───┐┌───┐│
│  │▒▒▒│ │A♥ │     │ · ││ · ││ · ││ · ││
│  └───┘ └───┘     └───┘└───┘└───┘└───┘│
│    ·  lifted card casts light  ·     │
│  ┌───┐┌───┐┌───┐┌───┐┌───┐┌───┐┌───┐ │
│  │▒▒▒││▒▒▒││▒▒▒││▒▒▒││▒▒▒││▒▒▒││▒▒▒│ │
│  └─┬─┘└─┬─┘└─┬─┘└─┬─┘└─┬─┘└─┬─┘└─┬─┘ │
│   accent bloom on legal drop         │
└──────────────────────────────────────┘
```

The one that makes the [win sequence](06-win-sequence.md) look like a firework,
because there's nothing else bright on screen.

- **Table**: `#0B0D10` with a very slow radial gradient centred on the tableau.
- **Light**: the *card* is the light source. A lifted card casts a soft radial glow
  onto the table beneath it (a pseudo-element with a blurred radial gradient,
  tracking the drag). Legal drop targets bloom faintly rather than outlining.
- **Accent**: cyan `#4FD1D9`, used sparingly and never at full saturation on large
  areas.
- **Type**: geometric grotesque, slightly wider tracking. The clock glows very
  faintly.
- **Default deck**: Minimal or High-contrast.
- **Caveat**: dark themes and light card faces mean the *cards* become the brightest
  thing on screen — which is correct — but card backs must be dark enough not to
  blaze. The dark theme ships a dedicated back.

## Decks

### Sourcing policy

We do not draw card faces. Good playing-card art is a large, fiddly body of work
(twelve court cards, four suits, legible at 48px and at 200px) and excellent
open-licensed versions already exist.

Selection criteria, in order:

1. **Licence we can actually honour** on a static site with visible attribution.
2. **Vector (SVG)**, so one asset serves every size.
3. **Legible at 48px wide** — the worst case is a 360px-wide phone in portrait with
   seven columns. Ornate courts turn to mush; the corner index is what matters.
4. **A complete 52**, consistently drawn.

### Candidate decks

| Deck | Source | Licence | Notes |
| ---- | ------ | ------- | ----- |
| **Classic** | [Byron Knoll's vector playing cards](http://byronknoll.blogspot.com/2011/03/vector-playing-cards.html), mirrored on [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Playing_cards_set_by_Byron_Knoll) and [notpeter/Vector-Playing-Cards](https://github.com/notpeter/Vector-Playing-Cards) | **Public domain** | The safe default. No attribution *required* — we credit anyway. Clean, traditional, unfussy courts. |
| **Traditional** | [Vectorized Playing Cards 3.2](https://totalnonsense.com/open-source-vector-playing-cards/), Chris Aguilar | **LGPL 3.0** | The most handsome open deck. Requires a specific attribution string displayed on a publicly accessible page — see below. |
| **French** | [SVG-cards](https://svg-cards.sourceforge.net/), David Bellot | **LGPL** | The GNOME/Aisleriot deck. Distinctive French court design; instantly familiar to Linux users. |
| **Minimal** | Ours | — | The one thing we *do* draw — and it turns out we don't draw it at all. No court illustration: rank + suit glyph, large, centred, set in the theme's typeface, which makes it *typography* rather than art. Trivial to produce, the most legible deck at phone size by a distance, and it is the deck the board shipped with in milestone 1. |
| **High contrast** | Ours | — | Minimal's geometry, pure black/white/accent, oversized indices. An accessibility feature, not a skin — see [08](08-accessibility.md). |
| **Four-colour** | Variant of Minimal | — | ♠ black, ♥ red, ♦ blue, ♣ green. The standard colour-vision accommodation and also just genuinely easier to scan. |

"Minimal" being ours resolves the tension in the [product brief](01-product-brief.md)
about sourced art limiting our identity: the *default look at phone size* can be
ours and distinctive, while the rich traditional decks are there for people who want
them.

### Licence handling

This matters enough to get right before any asset lands in the repo.

- **The site's own code is MIT.** Bundled third-party art keeps its own licence.
  `public/decks/<name>/LICENSE` ships alongside every deck, verbatim.
- **LGPL decks are used unmodified**, as separate files the page references — not
  inlined into the JS bundle, not recoloured. That keeps us squarely in "using the
  library", which is the arrangement LGPL is designed for. If a deck needs
  modification, the modified SVGs are published in-repo under the same licence.
- **Vectorized Playing Cards requires this exact string**, publicly visible:

  ```text
  Vectorized Playing Cards 3.2 | https://totalnonsense.com/open-source-vector-playing-cards/ | Copyright 2011,2025 – Chris Aguilar | Licensed under: LGPL 3.0
  ```

  It goes on `/credits`, linked from the settings sheet and the footer — not buried.
  Every deck gets an entry there whether its licence demands one or not.
- **NFT/blockchain use is explicitly prohibited** by that licence. Not a risk here;
  noted so nobody wonders.
- If honouring a licence ever becomes awkward, we drop the deck. Public-domain
  Classic plus our own Minimal is a complete product on its own.

### Delivery

Drawn card faces are **one SVG sprite per deck**, referenced with
`<use href="#c7h">`. 52 separate network requests is not acceptable on 4G; one
~120KB sprite that gzips to ~30KB is. The sprite is fetched once and cached;
switching decks fetches the new one with a crossfade.

Drawn faces must **not** be inlined into the HTML — that's 52 cards of markup on
every page load, and it would also inline LGPL art into our bundle.

**Minimal and its variants are the exception, and not really an exception**:
they have no art to deliver. A Minimal face is two text nodes and a colour
token inside the card element that already exists, so it costs no request, no
sprite and no licence, and it restyles with the theme for free. The rule above
is about *art*; typography is not art we have to ship.

## Card backs

Backs are ours, always, because they're the most-seen surface in the game (28 of
them on screen at deal time) and they're cheap: a tiling geometric pattern, two
colours from the theme, a border.

Three ship: **Lattice** (default, a fine diagonal weave), **Dot grid**, and
**Solid** (flat, with just a border — for the Minimal theme and for anyone who
finds patterns noisy). Each is a single SVG pattern, recoloured per theme by CSS
variable.

## Card anatomy

Regardless of deck:

- **Aspect ratio 2.5 : 3.5** (poker), locked. `aspect-ratio` in CSS, never
  height-and-width.
- **Corner radius** from `--card-radius`: 8px at desktop size, scaling down
  proportionally — a 48px-wide card with an 8px radius looks like a lozenge.
- **The corner index is the critical element.** In a fanned tableau column, only
  ~28% of each card's height is visible. The rank and suit must be fully legible in
  that strip, at 48px card width, for the deck to be acceptable. Any sourced deck
  that fails this gets a CSS-overlaid index drawn by us on top of it.
- **Face-down cards** show the back, full bleed to the card edge, with the same
  radius and border as a face.

## Empty slots

An empty pile is a `--slot-stroke` outline at the card's exact size and radius,
with a faint interior. Foundations additionally show a large, very low-contrast suit
glyph, so you can tell at a glance which foundation is which before any Ace lands.

The stock, when empty and recyclable, shows a circular-arrow glyph instead — that's
the only place the game uses an icon to teach a rule.

## What we are not doing

- No animated or video backgrounds.
- No seasonal themes, event skins, or limited-time decks.
- No unlockables. Every theme and deck is available on first load, in the settings
  sheet.
- No per-card animation flourishes that aren't motion feedback (no sparkles on
  every foundation drop — that's the [win sequence's](06-win-sequence.md) job, and
  spending it early cheapens it).
