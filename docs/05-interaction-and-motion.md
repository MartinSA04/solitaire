# 05 — Interaction & motion

Mobile-first: the phone layout is designed first and the desktop layout adapts
upward. Both are first-class to *use*; only one is first in the design order.

This is where most of the difference from Microsoft Solitaire Collection actually
gets made. The rules are the same rules everyone has. The feel is not.

## Layout

### Phone, portrait — the design target

Seven tableau columns must fit across the narrow axis. That constraint sets
everything else.

```text
┌─────────────────────────────┐
│ 2:14              37 moves  │  top bar, 44px, information only
├─────────────────────────────┤
│ ┌──┐┌──┐      ┌──┐┌──┐┌──┐┌──┐│
│ │▚▚││A♠│      │♠ ││♥ ││♦ ││♣ ││  stock waste · gap · foundations
│ └──┘└──┘      └──┘└──┘└──┘└──┘│
│                             │
│ ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐│
│ │▚▚││▚▚││▚▚││▚▚││▚▚││▚▚││▚▚││
│ └┬─┘└┬─┘└┬─┘└┬─┘└┬─┘└┬─┘└┬─┘│  tableau, fanned downward
│  │   │   │   │   │   │   │  │
│  ▼   ▼   ▼   ▼   ▼   ▼   ▼  │
│                             │
│         (grows down)        │
├─────────────────────────────┤
│   ↶ Undo    ? Hint    ⋯     │  bottom bar, 56px — THUMB ZONE
└─────────────────────────────┘
```

**Controls live at the bottom.** MSC puts them in a top bar, which on a modern phone
is the hardest place on the screen to reach. Undo is the most-pressed button in the
game and it belongs under your thumb.

Three buttons, and only three. The middle one is Hint, and becomes **Finish**
once the board has proved it cannot get stuck — the two never both apply, since
at that point the only hint worth giving is "press this". Everything else — a
new deal, the daily, replay, the statistics, every setting — is behind `⋯`,
which opens the menu sheet. A new deal is two taps rather than one, and over
about five moves it asks before it throws the game away; see
[02](02-game-spec.md).

When a hint has nothing to point at, a line appears above the bar — "No moves
left — undo, or try a new deal." — and leaves on its own. It is the only text
the game puts over the board, and it is a fact about the position rather than a
loss screen.

Sizing on a 360×780 viewport:

| Thing | Value | Why |
| ----- | ----- | --- |
| Side gutter | 8px | |
| Inter-column gap | 4px | |
| Card width | `(100vw - 16 - 24) / 7` ≈ **46px** | The binding constraint on everything |
| Card height | 46 × 1.4 ≈ **64px** | Locked aspect ratio |
| Fan offset, face-down | 0.14 × height ≈ 9px | Only the edge needs to be visible |
| Fan offset, face-up | 0.30 × height ≈ 19px | The corner index must be fully legible |
| Top bar | 44px | |
| Bottom bar | 56px + safe-area inset | |

A 19-card column (the theoretical worst case) is 64 + 18×19 ≈ 406px tall, which
fits. Real games reach ~12. If a column *would* overflow the available height, the
fan offset for that column compresses proportionally — the column squeezes, the
board never scrolls.

**The board never scrolls.** Ever. A solitaire game you have to scroll is a broken
solitaire game. The whole board is always on screen.

### Phone, landscape

The tableau gets short and wide. Cards grow to fill the width and the fan
offsets shrink, both of which the one layout engine already does — landscape
needed nothing from `Layout.ts`.

What it needed was the chrome. This was drawn as "a single narrow left rail",
and what shipped is the **desktop chrome**: one bar at the top, controls at the
right of it. The rail would give slightly larger cards (it costs width, which
landscape has, rather than height, which it has not) at the price of a third
chrome arrangement to build, test and keep working, for the one orientation
this section opens by saying nobody uses. One bar gets most of the height back
for none of that, and it is a layout the product already had.

So the chrome collapses on `(min-width: 48rem)`, or on `(min-width: 34rem) and
(max-height: 34rem)` — wide, *or short and still reasonably wide*. The second
half of that second condition is browser zoom: at 200% a 390px phone presents a
195×422 viewport, which is short without being wide, and one bar holding a
clock, a counter and three controls in 195px is three controls sitting on top
of a clock. Short and wide is a phone on its side; short and narrow is somebody
who has zoomed in. Everything else about landscape is what the engine was already
doing. Supported, not optimised.

### Tablet and desktop

The board is centred with a maximum card width of **110px** and does not grow
further; past that it stops being a solitaire table and starts being a poster. The
extra horizontal room goes to the table surface, which is the point of having a
nice table.

Desktop adds:

- Controls move to the top bar (there is no thumb zone), bottom bar disappears.
  The controls *move* rather than being rendered twice — two sets of the same
  three buttons would be two sets in the accessibility tree, and the wrong one
  would rot.
- Hover states: a card under the cursor lifts 2px; legal targets highlight while
  dragging. The lift is on **the cards a click would move**, not the one under
  the pixel: on a fanned column the visible strip of a buried card is nineteen
  pixels, and lifting it alone would promise something a click does not do. On
  a board where nothing is a click target and hit-testing is arithmetic, this
  is the only thing that tells you the game agrees with you about what you are
  pointing at.
- The legal-target highlight belongs to whatever is carrying the cards, which
  means the space bar gets it too — see [08](08-accessibility.md). It is a
  lighter fill and a ring, never a hue, and it is computed once when the pickup
  starts: what a pile will accept is a fact about the position, and the
  position does not change while a card is in the air.
- Keyboard shortcuts — see [08 — Accessibility](08-accessibility.md).
- A wider settings sheet as a centred dialog rather than a bottom sheet.

### Responsive strategy

One layout engine, driven by a single computed `--card-w`. Everything else —
gaps, fans, radii, type scale — is a multiple of it, in a `calc()`. There are no
breakpoints for the board, only one for where the chrome goes: `48rem` wide, or
`34rem` short, which is the same arrangement arrived at from the other side.

The board is anchored to the top of whatever space it is given, with a gap of
0.14 × card height above the top row — proportional to the card like every
other measurement, so it is a gap rather than a breakpoint. Without it the
stock's top edge *is* the chrome's bottom edge, and two surfaces of different
colours meeting on a line read as the card being clipped by the bar rather than
lying on a table under it.
Columns grow downward, so an anchored top row is a top row that never moves
while you play; the room left underneath on a tall screen is table, which is
what the [cascade](06-win-sequence.md) falls through at the end.

Card positions are **absolute, in a single positioned container, set via
`transform: translate3d()`**. Not flex, not grid. This is the load-bearing decision
of the whole UI and it's justified under [Motion](#motion) below.

## Input

### Touch (primary)

| Gesture | Result |
| ------- | ------ |
| **Tap a card** | Auto-move: send it to a foundation if legal, otherwise to the best tableau target. A card already on a foundation comes back down into a column. No target? A brief shake — of the whole run, not of one card of it. |
| **Tap the stock** | Draw. Tap the empty stock to recycle. |
| **Drag a card** | Pick up that card and everything above it that forms a valid run. |
| **Drag onto a pile** | Drop if legal; otherwise animate back. |
| **Long-press a fanned card** (350ms) | Peek — the column temporarily fans out fully so you can read buried cards. Release to collapse. |
| **Double-tap** | Nothing. Reserved, deliberately unused: single tap already does the smart thing, and double-tap would introduce a 300ms delay on every single tap to disambiguate. |

**Auto-move on tap is the most important interaction in the game**, because on a
46px card, dragging is fiddly and tapping is not. The target-choosing rule, in
order:

1. A foundation, if legal.
2. A tableau column that turns over a face-down card.
3. A non-empty tableau column.
4. An empty column, only if the card is a King and it's currently the top of a
   column (moving a lone King between empty columns is never useful).
5. Off a foundation into a column, for a card that is already home — the same
   gesture pointed the other way. A card can always be *dragged* back off a
   foundation when a run needs it, and on a phone dragging is the fiddly half
   of the interface; a tap that shook the card instead was the game refusing a
   move it has always allowed.

Every auto-move is undoable, which is the safety net that lets the heuristic be
aggressive.

**Rule 1 used to have an "unless".** A legal foundation move was held back while
the card's opposite-colour successors were still needed in the tableau — the
standard guard against sending a 7♥ up while a black 6 is looking for a home.
It is gone. It made the most-used gesture in the game unpredictable: two cards
that look equally home-able did different things, for a reason nothing on screen
explains, and `scripts/audit-automove.ts` put a number on how often — **2,671 of
the 2,715 taps that went somewhere the player had not asked for were this rule
overriding them.**

Removing it costs a greedy robot about three points of win rate (53.5% → 48.5%
at draw-1, 16.0% → 14.0% at draw-3, over deals 1–200) and takes the taps that
disobeyed the player from 2.7% to 0.2%. That is the trade the guard was making
on everybody's behalf. A robot that never presses Undo pays it; a person who can
see the black 6 on the table, and who tapped the 7♥ anyway, should not have to.

### Pointer (desktop)

Same grammar. Click = the auto-move tap. Drag = drag. Right-click = nothing (the
context menu stays; we're not hijacking it).

### Drag mechanics

The details that separate a good card game from a bad one:

- **Pick up on movement, not on press.** A pointer-down followed by ≥6px of
  movement starts a drag; a pointer-down followed by release is a tap. Below that
  threshold nothing visually happens, so a tap never flickers.
- **The dragged stack follows the pointer with zero smoothing.** No lerp, no spring,
  no easing on the drag itself. Any lag reads as the game being slow. Smoothing goes
  on the *release*, never on the follow.
- **Grab offset is preserved.** The card does not jump so its centre meets the
  cursor; you hold it where you grabbed it.
- **The stack lifts**: scale 1.04, shadow to `--card-shadow-lift`, rotation of
  ±1.5° proportional to horizontal velocity. Subtle enough that you feel it rather
  than see it.
- **Drop target is the pile whose rectangle the *dragged card's top-left corner*
  overlaps most** — not the pointer position. With a 46px card and a fingertip,
  pointer-based targeting is wrong constantly.
- **Legal targets highlight while dragging**, lightness + border, not hue alone.
- **Illegal drop animates back** along a 220ms spring to its origin. It does not
  snap instantly (feels like a bug) and it does not stay where you dropped it.
- **A stack in the air casts one shadow, not one per card.** The lift shadow is
  12px down with 28px of blur and a fanned run overlaps by about nineteen, so a
  shadow on every card drops a dark band across the card below it — a fan of
  separate cards being carried rather than a run picked up as one thing. The
  card at the foot of the run casts it; the ones buried in the run keep the
  small shadow they have on the table. Same rule for a keyboard pickup and for
  the desktop hover lift, which lifts a whole run too.
- **Pointer Events only** — `pointerdown`/`pointermove`/`pointerup` with
  `setPointerCapture`. No separate touch and mouse paths. `touch-action: none` on
  the board so the browser never steals a drag to scroll.

## Motion

### The core decision

Every card is a **persistent DOM element that exists from deal to new-deal and is
never created, destroyed, or re-parented**. There are exactly 52 of them in one
absolutely-positioned container. A move changes a card's
`transform: translate3d(x, y, 0)` and its `z-index`. That's it.

This falls out of what "clean animation" requires:

- A card moving from tableau to foundation animates *because its transform changed*,
  with a CSS transition. There is no FLIP measurement, no cloning into a flying
  layer, no reparenting mid-flight.
- Animations are interruptible for free. Tap three cards quickly and each retargets
  mid-flight; nothing queues or snaps.
- The compositor does all of it. `transform` and `opacity` only — never `top`,
  `left`, `width`, or anything that triggers layout.
- The [win sequence](06-win-sequence.md) can take the same 52 elements and drive
  them from a physics loop without any special case.

The alternative — piles as DOM containers with cards inside — means every move
reparents a node, which kills the transition, which means FLIP, which means
measuring 52 elements per move. It is the standard way to build this and it is why
most web solitaire feels janky.

### The timing scale

Four durations. Everything in the product uses one of them.

```text
--t-instant   90ms    feedback that must feel immediate: flip start, press
--t-quick    180ms    a card moving between piles — the workhorse
--t-settle   280ms    drop settle, sheet open, undo
--t-slow     480ms    stats card, the win sequence's slow fades
```

`--t-slow` was written down as the length of a **theme crossfade**, and there
is no theme crossfade: switching tables is instant. Two themes are two sets of
custom properties, and CSS cannot interpolate between most of what they hold —
a gradient into a flat colour, a shadow into `none`, a 1px hairline into 1.5px.
What *is* possible is fading the table while the cards on it snap, which reads
as a glitch rather than as a transition. A clean switch reads as "applied".

### The easing scale

```css
--e-out:    cubic-bezier(0.22, 0.61, 0.36, 1);   /* things arriving */
--e-inout:  cubic-bezier(0.65, 0, 0.35, 1);      /* things moving between states */
--e-spring: cubic-bezier(0.34, 1.32, 0.48, 1);   /* drop settle — one small overshoot */
```

`--e-spring` overshoots by ~4%. On a 46px card that's under 2px of travel. It is the
difference between a card being *placed* and a card *landing*, and it's the single
highest-value bit of polish in the non-win parts of the game.

### The move catalogue

| Motion | Duration | Easing | Detail |
| ------ | -------- | ------ | ------ |
| Deal | 22ms stagger × 28 | `--e-out` | Cards fly from the stock position. ~700ms total. The stagger is what makes it feel dealt rather than drawn. |
| Card to pile (tap) | `--t-quick` | `--e-out` | |
| Card to pile (drop) | `--t-settle` | `--e-spring` | Shorter distance, so more time is affordable |
| Flip face-up | `--t-instant` ×2 | `--e-inout` | `rotateY` 0→90° swapping the face at the midpoint, 90°→180°. A real flip, not a crossfade. |
| Draw (draw-1) | `--t-settle` | `--e-out` | A card is *turned off the deck*, not slid one slot right: it lifts on the way, and the flip is stretched to the length of the travel so it lands face-up as it arrives rather than 100ms early |
| Draw (draw-3) | `--t-settle` + 60ms stagger | `--e-out` | Three cards, fanned; the fan is what makes draw-3 readable |
| Recycle waste | `--t-settle` + 6ms stagger | `--e-inout` | The waste sweeps back under the stock with a slight arc, top card first. Staggered, because in draw-1 every card in the waste is at the same coordinates and two dozen of them leaving together is indistinguishable from one leaving |
| Illegal drop | 220ms | `--e-spring` | Return to origin |
| Illegal tap | 300ms | — | 3-cycle shake, ±3px, damping, on **every card the gesture was about**. Never a sound, never a colour change — a shake is enough and a red flash reads as being told off. |
| Undo | `--t-settle` | `--e-inout` | Deliberately *slower* than the move it reverses, so you can see what came back |
| Hint | 3 breaths, 1400ms | `--e-inout` | A ring on the card that can move and on the space it can move into — the destination's top card, or the empty slot itself. It breathes three times and then stays until the move is made. **Not a scale pulse**, which is what shipped first: a card in a fanned column grows *into* the cards above and below it, so the one thing being pointed at was the one thing partly hidden while it was pointed at, and a pair of cards bouncing reads as an error rather than as advice. |
| Auto-complete | 40ms → 18ms stagger | `--e-out` | Accelerates. Flows into the win sequence with no gap. |

### Z-index

A dragged stack is `z: 1000+`. Otherwise `z` is pile index × 100 + position in pile,
which means a card flying from column 2 to a foundation passes *over* columns 3–7.
Correct, and the alternative (flying under) looks broken.

Z-index changes happen at the *start* of a move, never at the end.

Which means every lift has to be **given back**. A refused drop springs home
along the 220ms spring and drops out of the drag band when it lands; leaving it
there — which is what shipped — parks the card above every pile on the table
until some unrelated render happens to rewrite it, and that render can be
several moves away.

### Reduced motion

`prefers-reduced-motion: reduce` sets every duration to 1ms except the flip (which
becomes a 90ms crossfade, because an instant flip is genuinely hard to follow) and
the win sequence, which has its own designed alternative in
[06](06-win-sequence.md). Cards still move — they just arrive immediately.

Critically, reduced motion does **not** mean no feedback. The illegal-move shake
becomes a 120ms border flash; the hint pulse becomes a persistent outline until the
next move.

## Performance budget

The target device is a four-year-old mid-range Android, ~£200 when new.

- **60fps** during drag, deal, and auto-complete. Non-negotiable.
- **Only `transform` and `opacity`** animate — which includes the individual
  transform properties `translate`, `scale` and `rotate`, and those are where
  the small offsets stacked on top of a card's position live: the hover lift,
  the shake, the draw's arc. A lint rule forbids transitioning anything else on
  a card.
- **A card's position and the offsets on top of it are two transitions, and
  they must not be written as two `transition` shorthands.** Both are one class
  on `.card`, so the later rule in the stylesheet wins outright: the hover lift
  disarmed every move of a card under the cursor, which is every card a mouse
  ever clicks, and taps looked like teleports on a desktop for as long as that
  was true. The move's half is a custom property (`--move-time`) that a motion
  class fills in for exactly as long as it is on the element, and the lift's
  half is written once on `.card`.
- `will-change: transform` on cards only **while a move is in flight**, removed
  after. Permanent `will-change` on 52 elements costs real memory on cheap GPUs.
- No layout reads during animation. Card geometry is computed once per resize into
  CSS variables; the move path never calls `getBoundingClientRect`.
- The board is one stacking context. No filters or backdrop-filters on the card
  layer — `backdrop-filter` in particular is a reliable way to halve the frame rate
  on Android.
- Playwright traces the deal, a 20-move game and the win sequence, and fails the
  build on dropped frames beyond a threshold.
