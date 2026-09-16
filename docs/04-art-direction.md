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
--card-radius        /* geometry: written per resize by Layout.ts, not by a theme */
--card-shadow-rest   /* card lying on the table */
--card-shadow-lift   /* card held by the pointer */
--card-stroke        /* card edge, for contrast on similar backgrounds */
--card-stroke-width  /* how heavy that edge — and the empty-slot outline — is */
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

`--card-radius` is in the contract because everything reads it, but no theme
writes it: it is geometry, and geometry has one owner —
[`Layout.ts`](07-architecture.md) puts it on `.board` on every resize. A theme
that sets it is overriding the layout, which is a bug.

Two hard constraints on any theme, checked by `test/themes/theme.test.ts`
rather than by remembering to look:

- A face-up card must be **separable from the table at 3:1** — by its own
  background, or by the stroke at its edge. Originally this was written as
  4.5:1 against the table, which turns out to be a rule only a dark table can
  keep: white on Minimal's warm paper ground is 1.2:1, and making it 4.5 would
  mean a mid-grey table, which is not that theme. **That is what the hairline
  is for**, and it is why `--card-stroke-width` is a token: a theme with no
  shadows has nothing else to draw the card's boundary with. Contrast *within*
  the card is unaffected — the ink is still 7:1 on the face, which is the
  number that decides whether a card can be read.
- The legal-drop highlight must be distinguishable **without relying on hue** — it
  changes lightness and adds a border, not just a colour. See
  [08 — Accessibility](08-accessibility.md).

A consequence of that 7:1, visible in every theme's tokens: **the red suits are
darker than a printed card's**. Pillarbox red on white is about 6.5:1, so the
decks here run nearer `#96131b`. At a 46px card, held at arm's length, this is
an improvement rather than a compromise.

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
- **Default deck**: Minimal. (Classic was the intention; it is not a deck we
  can ship — see the candidate table below.)

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
- **Default deck**: Minimal. High-contrast is a tap away for anyone who wants
  the indices bigger, and is not a decision to make on their behalf.
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
| **Classic** ✗ | [Byron Knoll's vector playing cards](http://byronknoll.blogspot.com/2011/03/vector-playing-cards.html), mirrored on [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Playing_cards_set_by_Byron_Knoll) and [notpeter/Vector-Playing-Cards](https://github.com/notpeter/Vector-Playing-Cards) | **Public domain** | Was the safe default, until it was measured. **Rejected:** the courts are traced bitmaps — `KC.svg` alone is 1.1MB and the 52 come to **8MB**, about 2MB gzipped. Sixty times the sprite budget, whatever the licence says. |
| **Traditional** ⏸ | [Vectorized Playing Cards 3.2](https://totalnonsense.com/open-source-vector-playing-cards/), Chris Aguilar | **LGPL 3.0** | The most handsome open deck, and **not shipped yet**: the canonical download is behind a download manager and the GitHub copies are exports of an export. Its licence demands an exact attribution string, and taking such a deck from a source we cannot verify is the wrong way to honour it. |
| **French** ✓ | [SVG-cards 4.0.2](https://svg-cards.sourceforge.net/), David Bellot and Huub de Beer | **LGPL 2.1+** | **Shipped.** The GNOME/Aisleriot deck. Genuinely vector, already a single sprite of 52 groups, and from a source we can name. 962KB, 339KB over the wire. |
| **Minimal** | Ours | — | The one thing we *do* draw — and it turns out we don't draw it at all. No court illustration: rank + suit glyph, large, centred, set in the theme's typeface, which makes it *typography* rather than art. Trivial to produce, the most legible deck at phone size by a distance, and it is the deck the board shipped with in milestone 1. |
| **High contrast** | Ours | — | Minimal's geometry taken as far as it goes: a pure white card, black ink, oversized indices, maximum weight. An accessibility feature, not a skin — see [08](08-accessibility.md). |
| **Four-colour** | Variant of Minimal | — | ♠ black, ♥ red, ♦ blue, ♣ green. The standard colour-vision accommodation and also just genuinely easier to scan. |

"Minimal" being ours resolves the tension in the [product brief](01-product-brief.md)
about sourced art limiting our identity: the *default look at phone size* can be
ours and distinctive, while the rich traditional decks are there for people who want
them.

#### What our three decks are, mechanically

A deck we draw is a **set of tokens**, exactly as a theme is, behind
`[data-deck]`. It owns two things and nothing else: the **ink** — which colour
each of the four suits takes — and the **type scale**: `--index-size`,
`--index-weight`, `--index-suit-scale`, `--pip-size`. Everything else about the
card is the table's.

That makes each of the three a small statement rather than an asset:

- **Minimal** declares no colour at all. It takes the table's ink, which is why
  it reads as the theme's own typography rather than as a deck laid on top of
  it, and why the Warm table's black is a warm near-black.
- **Four-colour** replaces the four inks and nothing else.
- **High contrast** additionally overrides `--card-bg`, the only deck that
  touches the card's surface — deliberately, because the point of it is to be
  the same deck on every table.

Its red stays red, which is worth saying plainly because "pure black and white"
was the original phrasing: **Klondike is built on alternating colours**, so a
deck that cannot tell red from black is a deck the game cannot be played with.
What "high contrast" means here is the darkest red that still reads as red
(7:1 on white), the heaviest weight, the largest index, and a corner suit glyph
grown nearly to the size of the rank so that suit is legible by silhouette.

Deck stylesheets are imported **after** theme stylesheets. The two are selected
by attributes of equal specificity, so that order is what decides a conflict,
and it is what "any deck works on any table" means in practice.

### Licence handling

This matters enough to get right before any asset lands in the repo.

- **The site's own code is MIT.** Bundled third-party art keeps its own licence.
  `public/decks/<name>/LICENSE.txt` ships alongside every deck, verbatim —
  `.txt` rather than a bare `LICENSE` so that a browser is served it as text
  instead of a download or a 404, since a licence nobody can open is not a
  licence being honoured. `test/decks/sourced.test.ts` refuses a deck that
  arrives without one.
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
`<use href="#club_7">`. 52 separate network requests is not acceptable on 4G;
one sprite is. The sprite is fetched once and cached, and the switch to it is a
crossfade.

Drawn faces must **not** be inlined into the HTML — that's 52 cards of markup on
every page load, and it would also inline LGPL art into our bundle.

Two things this section got wrong, both found by shipping a deck:

- **The sprite is fetched and then injected into the document**, and the
  `<use>` reference is to a `#id` in the same document rather than across
  files. `<use href="/decks/french/deck.svg#club_7">` — the obvious way, and
  what this doc described — **is not supported in Safari**, which is most of
  the phones this game is played on. Injecting a fetched file into the DOM is
  not inlining it into the bundle: it is still one cacheable file, arriving
  over the network, unmodified, and only when somebody asks for that deck.
- **~120KB gzipping to ~30KB was wishful.** Real traditional card art is an
  order of magnitude more than that: the deck we ship is 962KB, 339KB gzipped,
  and the one this doc picked first is twenty times *that*. The number was
  written on the assumption that a sourced deck would be the phone default. It
  is not — ours is, the sourced one is fetched on a deliberate choice, and
  nothing about a first load touches it. See [07](07-architecture.md).

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
finds patterns noisy).

Each is **a gradient**, not the SVG file this doc first specified, and the
reason is in the specification itself: it asked for one asset *recoloured per
theme by a CSS variable*, and neither an external SVG nor a data URI can read a
custom property. A gradient reads `--back-bg` and `--back-ink` directly and
costs no request at all. Three geometric patterns are well within what
gradients express; a fourth back that needed real drawing would ship as a file
and hard-code its own colours. Every measurement in one is a percentage of the
card rather than a pixel, so the weave is the same weave on a phone and on a
desktop.

Like a deck, a back is a **token** — `--back-pattern` — so switching one is an
attribute on `<html>` and the card element never learns there is more than one.

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

  The French deck fails it — its index is drawn about five pixels tall at a 46px
  card — so the overlay is not hypothetical: it ships. Our index sits in the
  top-left corner on a patch of the deck's own paper colour, covering that
  deck's index and only that. The courts, the pips and the bottom-right index
  are the deck's own. The corner we take is the one a fanned column shows.
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
