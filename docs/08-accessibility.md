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
| Card against table | 4.5:1 | Table surface |
| Chrome text | 4.5:1 | Chrome background |
| Clock/move counter at rest | 3:1 minimum | Deliberately dim, but readable |
| Empty-slot outline | 3:1 | Table |
| Legal-drop highlight | 3:1 | Table **and** the un-highlighted state |

Every theme in [04](04-art-direction.md) is checked against this table in review,
and a unit test asserts the token values still pass — themes drift.

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
which is exactly what the ARIA practices for grid-like widgets prescribe.

### Focus visibility

A 3px `--accent` ring with a 2px offset and a contrasting inner stroke, so it's
visible on any table colour. Always visible when navigating by keyboard
(`:focus-visible`), never shown for pointer interaction.

## Screen readers

The board is a labelled `application`-role region with a documented key model, and
an offscreen live region announces state.

### Structure

```html
<section role="application" aria-roledescription="Klondike solitaire board"
         aria-describedby="board-help">
  <!-- 13 piles, each a focusable group with an accessible name -->
</section>
<p id="board-help" class="sr-only">Arrow keys to move between piles… </p>
```

### Pile naming

Each pile's accessible name is a **complete, readable description of its state**,
updated on every move:

- `"Tableau column 4. Seven cards, three face down. Top card: Jack of hearts."`
- `"Foundation, spades. Empty."`
- `"Foundation, hearts. Up to the seven."`
- `"Stock. Eleven cards remaining."`
- `"Waste. Top card: Queen of clubs."`

Card names are spelled out — "Queen of clubs", never "Q♣", which screen readers
render unpredictably.

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
| No moves | `"No moves available. Undo, or start a new deal."` |
| Win | `"You won. Two minutes fourteen seconds, one hundred and twenty-eight moves."` — `assertive` |

Selection during keyboard play is announced on focus, not on every arrow press
beyond the pile boundary, so scanning the board doesn't produce a wall of speech.

### The win sequence with a screen reader

The cascade is decorative and is `aria-hidden`. The win announcement fires at
**Stage 0**, immediately — a screen-reader user is not made to wait 13 seconds to be
told they won — and focus moves to the result panel when it appears.

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
  - **Long-press peek** fans a column out fully, making buried cards reachable at
    full size.
  - **Drop targeting uses the dragged card's corner, not the fingertip** — see
    [05](05-interaction-and-motion.md) — which removes the fat-finger problem from
    dropping entirely.
- **A card-size setting**: "Comfortable" (default) and "Large". Large drops the
  tableau to a layout where cards are ~30% bigger and columns are horizontally
  scrollable in a *paged* way — the one place the no-scrolling rule bends, because
  for someone who can't see a 46px card, a scroll is better than a game they can't
  read.

## Text and language

- All UI text at ≥ 16px, with a system-font stack fallback so OS-level font scaling
  applies.
- Respects browser zoom to 200% without layout breaking. The board scales with it.
- `lang="en"` on the document. No i18n in v1 — but all UI strings live in one
  module rather than being inlined in components, so adding it later is mechanical.
  Card names, in particular, will need per-language forms.
- No text in images. The decks' rank indices are vector glyphs, not raster.

## Testing

- `axe-core` runs in Playwright against the game page, the settings sheet, the
  stats sheet and the result panel. Zero violations is the gate.
- A **keyboard-only Playwright test plays a complete game to a win** using nothing
  but key events. This is the real proof; an audit tool can't tell you the game is
  completable.
- Screenshot tests at 200% zoom and with the Large card setting.
- Contrast assertions run as a unit test over the theme tokens.
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
