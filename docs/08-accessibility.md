# 08 — Accessibility

Solitaire is played by a much older audience than most games, on phones held at
arm's length, often with reading glasses off. Accessibility here is not a
compliance exercise bolted to the end — it is a description of the actual median
player.

Target: **WCAG 2.2 AA**, with the specific commitment that the game is *completable*
by keyboard alone and by screen reader alone.

## Colour and contrast

### Contrast requirements

| Element | Ratio | Against |
| ------- | ----- | ------- |
| Card face (rank/suit) | 7:1 | Card background |
| Card against table | 3:1 | Table surface — by the card's background **or** its edge |
| Chrome text | 4.5:1 | Chrome background |
| Clock/move counter at rest | 4.5:1 | Dimmest thing in the chrome, still ordinary text |
| Empty-slot outline | 3:1 | Table |
| Legal-drop highlight | 3:1 | Table **and** the un-highlighted state |

Every theme in [04](04-art-direction.md) is checked against this table by
`test/themes/theme.test.ts`, which reads the theme stylesheets, composites the
translucent tokens onto whatever is behind them, and fails on the ratio —
themes drift, and a colour nudged to look right on the one screen the person
nudging it owns is how empty slots disappear on everyone else's.

The clock row asked for **3:1** until the axe gate was pointed at a light
table for the first time and found 3.87:1 on the Minimal chrome. "Deliberately
dim" is a real intention and it survives — the clock is still the quietest
thing on the screen — but it is ordinary 15px text, and WCAG 2.2 AA asks 4.5 of
ordinary text no matter what it was meant to feel like. This document opens by
naming that target; the row contradicted it, and the row was wrong. Only the
Minimal table was short, because dark ink on a light ground loses contrast to
transparency far faster than light ink on a dark one.

The card-against-table row asks for 3:1 rather than the 4.5:1 it was first
written as, and allows a theme to meet it with the card's edge instead of its
background. See [04](04-art-direction.md#token-contract) for why: a light table
with white cards cannot clear 4.5 without ceasing to be a light table, and the
hairline is the honest answer. The 7:1 row is untouched, and it is the one that
decides whether a card can be *read*.

### Never hue alone

Two places in the game communicate state with colour, and both need a second
channel:

- **Legal drop targets** change **lightness and border width**, not hue. A target
  is recognisable in greyscale.
- **The hint** pulses with **scale and an outline**, not a colour wash.

### Red/black suit discrimination

The core accessibility problem in every card game: Klondike's rules are *built on*
red-vs-black, and deuteranopia and protanopia together affect roughly 1 in 12 men.

Three accommodations, all in settings, none hidden behind a "disability" label:

1. **Four-colour deck** — ♠ black, ♥ red, ♦ blue, ♣ green. The standard poker
   solution. Also just faster to scan, so it's offered to everyone as a deck
   choice rather than an accessibility toggle.
2. **High-contrast deck** — oversized indices, pure black/white, maximum weight.
3. **Suit-shape emphasis** — the corner index suit glyph enlarged to ~1.6× the
   default, so suit is readable by *silhouette* at a glance. A toggle that applies
   to any deck.

## Motion

`prefers-reduced-motion: reduce` is honoured everywhere, and is **overridable in
settings in both directions** — someone may have the OS setting on for other apps
but want the cascade here, and someone may want motion reduced without changing
their OS.

The important principle, stated in [05](05-interaction-and-motion.md) and
[06](06-win-sequence.md): **reduced motion means different feedback, not absent
feedback.** Specifically:

- Illegal move: a 120ms border flash replaces the shake.
- Hint: a persistent outline replaces the pulse.
- The win sequence has a fully designed ~2.4s bloom alternative, not a cut to the
  result panel. Winning still feels like winning.

No parallax, no auto-playing background motion, nothing that moves without the
player having caused it. The only continuous motion in the product is the
[win cascade](06-win-sequence.md), and it's skippable and reducible.

## Keyboard

The whole game is playable from a keyboard, with no pointer.

### Navigation model

A **roving focus** over piles: stock, waste, four foundations, seven tableau
columns — thirteen positions, in a fixed order.

| Key | Action |
| --- | ------ |
| `←` `→` | Move focus between piles |
| `↑` `↓` | Within a tableau column, extend/retract the selection up the fanned run |
| `Space` / `Enter` | Pick up the selected card(s); press again on a target pile to drop |
| `Escape` | Cancel a pickup |
| `S` | Draw from stock |
| `A` | Send the focused card to its foundation, if legal |
| `F` | Finish (auto-complete), when available |
| `Z` / `Ctrl+Z` | Undo |
| `H` | Hint |
| `N` | New deal |
| `R` | Replay this deal |
| `?` | Shortcut overlay |
| `Tab` | Moves to the chrome (bars, sheets) — **not** through the 52 cards |

`Tab` never enters the card layer. Fifty-two tab stops is not navigation, it's a
punishment; the board is a single composite widget with its own arrow-key model,
which is exactly what the ARIA practices for grid-like widgets prescribe. One
pile carries `tabindex="0"` and the other twelve carry `-1`, so the board is one
stop on the way to the chrome and the arrows are what move the focus inside it.

Three things the model settled once it was built:

- **The focus wraps.** Thirteen piles is a ring you scan, not a list you walk
  off the end of, and being stuck at the stock while looking for column seven is
  how people stop using a keyboard model.
- **Arriving at a pile always takes its top card.** A reach carried over from
  the column you left would mean the selection changing under a key that only
  said "right".
- **`N` and `R` ask before they throw a game away**, past the same five moves
  the menu asks at — as a second press of the same key rather than a dialog to
  tab into and back out of. The question goes on screen in the same
  `role="status"` line a hint uses, so it is heard as well as seen.

`Escape` belongs to an open sheet before it belongs to a pickup, and a sheet is
a real `<dialog>` opened with `showModal`, so that is simply true rather than
arranged.

### Focus visibility

A 3px `--accent` ring with a 2px offset and a contrasting inner stroke, so it's
visible on any table colour. Always visible when navigating by keyboard
(`:focus-visible`), never shown for pointer interaction.

## Screen readers

The board is a labelled `application`-role region with a documented key model, and
an offscreen live region announces state.

### Structure

```html
<div class="board" role="application" aria-roledescription="Klondike solitaire board"
     aria-describedby="board-help">
  <!-- 13 piles, each a <button> with an accessible name -->
</div>
<p id="board-help" class="sr-only">Arrow keys to move between piles… </p>
```

The thirteen piles are **buttons**, not bare focusable groups. Two reasons, and
the second is the one that matters:

- Every screen reader announces a focused button and its name. A `div` with a
  `tabindex` and an `aria-label` is at the mercy of which one is running.
- A button can be **activated**, and on a phone that is the entire interaction.
  VoiceOver and TalkBack have no arrow keys: you swipe to a pile and double-tap
  it, and the double-tap dispatches a click straight at the element. That click
  does exactly what the space bar does — pick up, then put down.

These are the same slot elements the empty piles were always drawn as, so the
board gained thirteen names and no new geometry.

A click from a *finger* is a different matter: the board hit-tests every real
pointer arithmetically and `Drag` plays the move, so a click that also reached
the button would play it twice. The two are told apart by `detail` — a
synthesised click carries zero, a real one carries the click count — and
`e2e/keyboard.pw.ts` holds both halves of that, because a bug in either one is
silent.

### Pile naming

Each pile's accessible name is a **complete, readable description of its state**,
updated on every move:

- `"Tableau column four. Seven cards, three face down. Top card: Jack of hearts."`
- `"Foundation, spades. Empty."`
- `"Foundation, hearts. Up to the seven."`
- `"Stock. Eleven cards remaining."`
- `"Waste. Top card: Queen of clubs."`

Card names are spelled out — "Queen of clubs", never "Q♣", which screen readers
render unpredictably. **So are numbers**: "column four", not "column 4". These
are sentences being spoken rather than a display being read, and a bare "4"
after a colon comes out as an ordinal in some voices. `src/game/strings.ts` is
the one module any of this text lives in, and `test/game/strings.test.ts` walks
every pile of a whole game asserting that no label ever contains a glyph or a
digit.

The count of face-down cards is the one thing a sighted player gets for free and
a screen-reader user cannot infer, which is why it is in the label rather than
left to the live region.

### Live announcements

A `aria-live="polite"` region. Terse, because verbose announcements make a game
unplayable:

| Event | Announcement |
| ----- | ------------ |
| Move | `"Jack of hearts to column 4."` |
| Move turning a card | `"Jack of hearts to column 4. Five of spades turned up."` |
| To foundation | `"Seven of hearts to foundation."` |
| Illegal | `"Not a legal move."` |
| Draw | `"Drew queen of clubs."` (draw-3: `"Drew three. Top card: queen of clubs."`) |
| Recycle | `"Waste returned to stock."` |
| Undo | `"Undid. Jack of hearts back to column 2."` |
| Hint | `"Hint: jack of hearts from column 2 to column 4."` |
| Picked up | `"Picked up jack of hearts."` (a run: `"…and two more."`) |
| Put back | `"Put back."` |
| Selection grew or shrank | `"Jack of hearts and two more."` |
| No moves | `"No moves left — undo, or try a new deal."` |
| Win | `"You won. Two minutes fourteen seconds, one hundred and twenty-eight moves."` — `assertive` |

Moving the focus between piles is **not** a live-region announcement. Focus
landing on a pile is what makes a screen reader read its name, and the name is
already a complete description — announcing it again would say everything twice.
The live region is for what the player *did*, and `↑` and `↓` are the one
exception, because changing the selection does not move the focus.

"No moves left" is not in the live region either: it is the one sentence the
game puts on the screen, in a `role="status"` line, so it announces itself. One
string, one place, and the same is true of the second-press question `N` and
`R` ask.

Two live regions, not one, and they are written in turn. A screen reader
announces a *change* of text, and "Not a legal move." following "Not a legal
move." is not one — which is precisely the announcement a player pressing space
at the wrong pile twice most needs to hear.

### The win sequence with a screen reader

The cascade is decorative and the board is taken out of the accessibility tree
for the length of it — with `inert` rather than `aria-hidden`, because the focus
is very likely sitting on a pile when the last card goes home and
`aria-hidden` over a focused element is a lie the browser will not tell for you.
`inert` hides it *and* moves the focus out.

The win announcement fires at **Stage 0**, immediately — a screen-reader user is
not made to wait 13 seconds to be told they won — and focus moves to the result
panel when it appears. The live regions sit outside the board for exactly this
reason: the one moment they have something important to say is the one moment
the board is inert.

## Targets and ergonomics

- **Every chrome control is ≥ 44 × 44 CSS px**, per WCAG 2.2 Target Size (Minimum).
- **Cards are exempt and cannot comply** — a 46px-wide card is 46px wide, and the
  fanned overlap makes the *visible* strip of a buried card ~19px tall. This is
  inherent to the game (the exception for "essential" presentation applies), and it
  is mitigated concretely:
  - **Tap-to-auto-move** means most play needs no precise dragging at all — this is
    the primary accommodation and the main reason it's the default interaction.
  - **Hit areas extend beyond the visual card** by 4px on each side, overlapping
    invisibly; the topmost card wins ties.
  - **Long-press peek** fans a column out fully, so a buried card can be *read*
    at full size before anything is done with it. It does not make one easier to
    hit: the cards slide under a stationary finger, so the gesture ends where it
    began and the column closes. Reaching is what the two points above are for.
  - **Drop targeting uses the dragged card's corner, not the fingertip** — see
    [05](05-interaction-and-motion.md) — which removes the fat-finger problem from
    dropping entirely.
- **A card-size setting**: "Comfortable" (default) and "Large". Large shows five
  of the seven columns instead of all of them, which buys a card **38% wider** on
  a phone — 49.6px to 68.5px at 390px — and pages the tableau sideways for the
  other two. The one place the no-scrolling rule bends, because for someone who
  can't see a 46px card, a page is better than a game they can't read.

  Three things the build settled that the paragraph above did not foresee:

  - **The top row has to wrap.** It is as wide as the tableau — the same seven
    slots — so a card too big for seven columns is a card too big for the six
    piles above them, and the stock and the last foundation simply fall off the
    side. They cannot page with the tableau: they are where every move ends up,
    and a board whose fixed points slide away has none. So the stock and waste
    keep the first line and the four foundations take the second. It costs about
    150px of height, and a phone has it — a real game uses under half the board's
    height, because the cards are limited by width and never by height.
  - **Buttons, not a swipe.** A horizontal drag on this board already means "pick
    a card up and carry it", and a gesture that means two things on one surface
    means neither. Buttons are also the only version a keyboard or a screen
    reader can use — and the arrow keys need none of it, because the page follows
    the roving focus rather than the other way round. The focus is the only idea
    either of them has of where it is, so it cannot be left off the side.
  - **Nothing needs a drag across a page.** Tap-to-auto-move is the primary
    interaction for exactly the reasons listed above it, and it sends a card
    wherever it should go whether or not that pile is on screen. Paging never
    stands between a player and a move.

  On a board wide enough to hold all seven columns at the 110px cap the setting
  changes nothing and there is no pager, which is every desktop. It exists for
  the phone it was written for.

## Text and language

- All UI text at ≥ 16px, with a system-font stack fallback so OS-level font scaling
  applies.
- Respects browser zoom to 200% without layout breaking, which
  `e2e/desktop.pw.ts` holds. The board does not scale *with* zoom, and that is
  worth being clear about: every measurement on it is a multiple of a card
  width computed from the viewport, so at 200% the viewport halves in CSS
  pixels, the cards halve with it, and they come out exactly the same physical
  size. Zoom cannot make a card bigger. That is why the Large card setting
  exists at all.

  What zoom does change is the chrome, which is in fixed pixels, and the
  *shape* of the window: 200% on a 390px phone is a 195×422 viewport, short
  without being remotely wide. That is why the chrome collapses to one bar on
  "short **and** wide" rather than on short — short and wide is a phone on its
  side, short and narrow is somebody who has zoomed in, and they want the
  layout they already had, only bigger.
- `lang="en"` on the document. No i18n in v1 — but all UI strings live in one
  module rather than being inlined in components, so adding it later is mechanical.
  Card names, in particular, will need per-language forms.
- No text in images. The decks' rank indices are vector glyphs, not raster.

## Testing

- `axe-core` runs in Playwright against the game page, the settings sheet, the
  stats sheet, the shortcut list, the result panel and `/credits` —
  `e2e/axe.pw.ts`. Zero violations is the gate, and the tags are WCAG 2.2 AA
  plus axe's best-practice pack, which objects to things that are not failures
  and are still worth knowing.

  The board is audited on all three tables, because two of the rules are about
  colour and there are three of them to get it wrong on, and once more with a
  card picked up — a pickup changes what the board *is* without changing a line
  of its markup, which is exactly how a label ends up describing the wrong pile.

  Worth saying plainly, because an automated audit is the easiest accessibility
  work to mistake for all of it: axe finds perhaps a third of what can be wrong
  with a page, and none of the third that matters most here — whether the game
  can be played at all. That is the keyboard test's job and the manual passes'.
  What the gate catches is a control that lost its name in a refactor, a
  heading order that drifted, a token nudged under 4.5:1: cheap to find,
  embarrassing to ship.

  It found one thing on the way in, and it was real. Every page has a landmark
  now: the game *is* its page, so `.game` is a `<main>`, and content outside a
  landmark is content a screen reader has no way to jump to.
- A **keyboard-only Playwright test plays a complete game to a win** using nothing
  but key events — `e2e/keyboard.pw.ts`. This is the real proof; an audit tool
  can't tell you the game is completable. It has a twin in
  `test/game/keyboard.test.ts`, which types the same winning line through the
  model with no browser in it: the browser test is about the wiring, the unit
  test is about the grammar, and the two fail in usefully different ways.
- A visual baseline of the Large card setting, which is a second board layout
  and so a second thing that can look wrong, and an axe pass over it including
  the pager. `e2e/cardsize.pw.ts` holds the rest: that the top row does not move
  while the tableau pages, that all six of its piles stay on screen, that the
  keyboard drags the page along behind the focus, and that a card on the far
  page still goes home when it is tapped.
- Contrast assertions run as a unit test over the theme tokens.
- Every sentence the game speaks is a unit test in `test/game/strings.test.ts`,
  including a sweep over every legal move of a whole game asserting that none of
  them is announced as silence.
- Manual VoiceOver (iOS) and TalkBack (Android) passes before any release that
  touches the board, because live-region behaviour is not reliably testable in
  automation.

## Not doing

- **No dedicated "accessibility mode"** that reconfigures the app. The
  accommodations are individual settings, phrased as preferences, available to
  everyone. A four-colour deck is a deck, not a diagnosis.
- No audio description of the board state beyond the live region.
- No switch-control or eye-tracking-specific work in v1. The keyboard model is the
  foundation those build on, and it's in place.
