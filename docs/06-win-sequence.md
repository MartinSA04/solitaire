# 06 — Win sequence

The reason to build this site.

Everything else here is a well-made version of a thing that already exists. This is
the part that has to be better than anyone else's, and it's the part that gets
shown to a friend. It gets its own doc, it gets built early, and it is allowed to be
expensive.

## The brief

An **escalating multi-stage sequence**: the board finishes itself, the cards erupt,
the screen clears, and the result arrives. Nostalgic in shape — it descends directly
from the Windows 3.x cascade — but with real physics, real sound, and a frame rate
that machine could not have dreamed of.

Two rules constrain everything below:

1. **It is always skippable.** One tap, at any moment, jumps to the end card. A
   celebration you can't escape is a punishment.
2. **It never blocks the next game.** From the moment the last card lands, "new
   deal" is reachable in one tap.

## Anatomy

```text
t=0.00  ┌─ Stage 0 — THE BEAT ────────────────────────────┐
        │  last card lands · everything stops · 140ms     │
0.14    ├─ Stage 1 — ASCENSION ───────────────────────────┤
        │  foundations pulse ♠♥♦♣ in turn · light sweeps  │
        │  the table · chrome fades out                   │  ~860ms
1.00    ├─ Stage 2 — CASCADE ─────────────────────────────┤
        │  52 cards launch from the foundations           │
        │  gravity · bounce · trails · one note per       │  ~11s
        │  bounce, ascending pentatonic                   │  (skippable)
~12.0   ├─ Stage 3 — CLEAR ───────────────────────────────┤
        │  trails bloom, then wipe outward                │  600ms
12.6    ├─ Stage 4 — THE CARD ────────────────────────────┤
        │  result panel rises · time · moves · deal no.   │  480ms
        │  · records beaten · replay / new / share        │
        └─────────────────────────────────────────────────┘
```

Total ~13s if watched to the end; ~1s if skipped immediately.

## Stage 0 — The beat (0 → 140ms)

The final card settles onto its foundation. Then: **nothing**.

No sound, no motion, 140 milliseconds of complete stillness. Long enough to
register as deliberate, short enough that it doesn't read as a hang.

This is the most important 140ms in the product. Every celebration animation that
feels cheap starts *instantly*, which makes it feel like a canned response rather
than a reaction. The pause is what makes the rest land.

The clock stops here.

## Stage 1 — Ascension (140ms → 1000ms)

The board acknowledges what happened before it destroys itself.

- **The four foundations pulse in sequence** — ♠, ♥, ♦, ♣ at 90ms intervals. Each
  pulse: scale 1.0 → 1.06 → 1.0 over 260ms on `--e-out`, plus a brief bloom of
  `--win-bloom` behind the pile.
- **A light sweep** crosses the table left to right over 700ms — a wide, soft
  gradient band at ~12% opacity. In the dark theme this is the moment the table
  stops being black.
- **The foundation piles lift**: `translateZ`-equivalent scale to 1.02, shadow
  deepening to roughly double `--card-shadow-lift`. They look like they're about to
  go.
- **The chrome fades out** — bars, clock, buttons, all to opacity 0 over 400ms.
  The screen empties of everything that isn't table and cards.
- **Sound**: one soft ascending four-note arpeggio, in time with the pulses. The
  only musical phrase in the entire product.

At the end of Stage 1, the screen contains exactly four piles of cards on a table.

## Stage 2 — Cascade (1000ms → ~12s)

The cards leave.

### Launch

Cards launch **one at a time from the top of each foundation, cycling ♠→♥→♦→♣**, so
the piles deplete evenly rather than one at a time. Kings go first, Aces last.

- **Launch interval**: 170ms, easing down to 70ms over the sequence. It starts
  measured and ends in a torrent. 52 cards, ~11 seconds.
- **Initial velocity**: `vx` ∈ ±(180…420) px/s **at a 110px card**, scaled by
  card width, biased *away* from the nearest screen edge so cards travel across
  the board rather than immediately off it. `vy` ∈ −(120…260) px/s — a slight
  upward toss before gravity takes them.

  `vx` is the only velocity here that scales. Everything that falls is measured
  in pixels because the drop is the height of a screen, and screens are the same
  order of magnitude everywhere; but the distance a card must cover to *leave*
  is measured in cards, because the board is by construction seven of them
  across. Left absolute, a 46px-card phone throws cards clean off the side
  before most of them ever reach the floor — simulated over six seeds at
  390×844, the whole deck produced **16 bounces against a desktop's 131**. The
  cascade's rhythm is its bounces, so a phone got a nearly silent one. Per card
  width the two agree at ~64, and the desktop numbers are unchanged, because at
  the maximum card width the multiplier is 1.
- **Spin**: `ω` ∈ ±(90…240) °/s, correlated with `vx` so a card thrown right spins
  right. Rotation is 2D only; no perspective flipping, which at these sizes reads as
  flicker rather than depth.

### Physics

A single `requestAnimationFrame` loop with a fixed 1/120s timestep and an
accumulator, so the simulation is frame-rate independent and identical on a 60Hz
phone and a 120Hz one.

```text
gravity        1600 px/s²
restitution    0.72        (bounce height ≈ 52% of drop height)
friction       0.98        horizontal damping per bounce
spin damping   0.94        per bounce
```

- Cards bounce off the **bottom edge only**. Side walls are open — a card leaving
  the left or right edge is gone, which keeps the screen clearing and prevents 52
  cards pinballing forever in a small viewport.
- A card is **culled** when it is fully off-screen *and* moving away, or when its
  bounce energy falls below a threshold near the floor (it slides off).
- Hard cap: **any card still alive after 6 seconds is force-culled**, so the
  sequence cannot stall.
- Collisions between cards: **none**. 52-body collision at 120Hz on a cheap phone is
  not affordable, and visually it adds nothing — the eye reads a cascade of
  independent objects.

### Trails

The thing the original couldn't do, and the thing that makes it read as *ours*.

A `<canvas>` sits **beneath** the card layer, at device pixel ratio. Each frame:

1. Fade the whole canvas by **α = 0.055**, with `destination-out` — subtracting
   alpha rather than adding paint. This is the entire trail mechanism: old frames
   decay exponentially rather than being erased, leaving a soft ~20-frame comet
   tail. (Originally specified as a fill in the table colour. It became a
   subtraction when the tables turned out to be gradients in every theme we
   ship, so fading towards one flat colour leaves a visible rectangle of
   not-quite-table. Same tail, same cost, and the trails now decay into the real
   table.)
2. For each live card, paint a rounded rect at its current position, at **α =
   0.1**. Very low, because the tail is made of overlap — a card crossing the
   screen advances about a seventh of its own width per frame, so seven rects
   stack on any given pixel before the fade has taken them. At anything near
   0.5 that composites to opaque and the cascade becomes ribbons with cards on
   top.

Cost: one full-canvas fill plus 52 small fills per frame. Trivially affordable, and
the fade is free because it's the same operation as the clear.

The trail colour is the card's, not the accent's — so red cards leave warm trails
and black cards leave pale ones, and the screen fills with colour that came from the
deck.

Specifically it is the suit's ink mixed **half way towards the card's face**,
which is what a card's dominant colour actually is: mostly face, with a little
ink on it. Pure ink makes the black suits invisible against a dark table and
kills them entirely under the additive compositing below; pure face makes all
four suits the same colour.

In the **dark theme** the trails additionally composite with `lighter`, which is
where the "firework" reading comes from and why that theme was designed for this
moment. Which themes do this is a theme's decision, so it is a token —
`--win-trail-blend`, in the contract in [04](04-art-direction.md).

### Sound

One note per **bounce**, not per launch — so the rhythm is generated by the physics
and is different every time.

- A **pentatonic scale** (C D E G A), ascending as the cascade progresses across
  roughly two octaves. Pentatonic because no two notes can clash: whatever rhythm
  the physics produces, it cannot sound wrong.
- **Velocity-mapped**: a hard bounce is louder and brighter; a dying card ticks
  quietly.
- **Voice cap of 8** simultaneous notes, oldest stolen. Prevents the end of the
  cascade turning to mud.
- A soft sub-bass thump under the first bounce of each card, heavily low-passed.

This is the one place the product's "subtle sound only" rule relaxes — and it's
still generative texture, not a fanfare.

## Stage 3 — Clear (~12s → 12.6s)

When the last card is culled:

- The canvas trails **bloom**: one frame at 2.2× alpha, then the per-frame fade
  alpha jumps to 0.22 so the whole thing washes out over ~400ms.
- A radial wipe of `--win-bloom` expands from the centre of the tableau at 12%
  opacity and dissipates.
- Sound: the arpeggio from Stage 1, inverted and descending, resolving.

The table is now empty.

## Stage 4 — The card (12.6s → 13.1s)

A panel rises from the bottom (phone) or scales up from centre (desktop) over 480ms
on `--e-out`.

```text
        ┌────────────────────────────────┐
        │                                │
        │            You won             │
        │                                │
        │      2:14          128         │
        │      time         moves        │
        │                                │
        │   ★ Best time on this deal     │
        │                                │
        │   Deal #4 811 209  ·  Draw 1   │
        │                                │
        │  ┌──────────┐  ┌─────────────┐ │
        │  │  Replay  │  │  New deal   │ │
        │  └──────────┘  └─────────────┘ │
        │        Share this deal         │
        └────────────────────────────────┘
```

- **Time and moves**, large, with the numbers counting up from zero over 600ms —
  the only gratuitous flourish in the panel, and it makes the numbers feel earned.
- **A record line, only if a record was set.** "Best time on this deal", "Fewest
  moves", "Fastest game yet". If nothing was beaten, the line is absent — not
  "you didn't beat your record", which is a small punishment for winning.
- **The deal number and draw mode**, so you can note it or share it.
- **Replay** (same deal, race yourself) and **New deal**, equal weight.
- **Share this deal** copies `https://solitaire.martinsundal.no/?deal=4811209&draw=1`
  to the clipboard, or opens the native share sheet where available. It shares a
  *deal*, not a score — there is no boast, just "try this one".
- **No** upsell, rating prompt, streak reminder, ad, or "double your reward".

The panel is dismissible — tap outside it, or `Escape` — and behind it is the
empty table with a fresh deal already available.

Two things on it wait for milestone 5, which is where the storage they read
from arrives: **the record line** and **share**. A record line that can only
ever say nothing is worse than no record line, and a share button belongs with
the rest of sharing. The chrome fades back in with the panel, so New deal is
reachable whether the panel is up or dismissed.

## Skipping

A tap anywhere during Stages 1–3 jumps straight to Stage 4:

- Physics loop stops, cards cull instantly.
- The canvas fades over 180ms rather than cutting.
- Audio voices release over 120ms rather than stopping dead.
- The panel rises normally.

Total skip-to-panel: ~300ms. It must feel like a choice, not like an interruption
being punished.

A **"skip"** affordance appears at the top-right after 2 seconds of cascade, at low
opacity — for the person who doesn't know the whole screen is tappable. It is the
only labelled control: the full-screen tap target behind it is decorative and
hidden from assistive technology, because a focusable element that a screen
reader cannot see is a bug, and two buttons that do the same thing is worse UI
than one.

Reduced motion has no Stage 2 and is over in 2.4 seconds, so the affordance
never appears there. There is nothing to sit through.

## Running it without winning

Two query flags, and between them everything that makes any of this testable:

| Flag | Does |
| ---- | ---- |
| `?win` | Runs the whole sequence on load, on a won board staged onto the card layer. The game underneath is the real one and is untouched. |
| `?winseed=N` | Seeds the physics **and** fixes the timestep, so the same seed produces the same cascade whatever the machine was doing. |

Without the second, nothing about Stage 2 is testable and the Playwright suite
is thirteen seconds of coin toss. Without the first, looking at the sequence
means winning a game first. Neither touches the deal, which has its own seed and
its own guarantees.

`?win` stages a *won* board rather than celebrating whatever is on screen,
because fifty-two face-down cards falling off a board that was never won is not
the thing being looked at.

## Reduced motion

`prefers-reduced-motion: reduce` gets a **designed alternative**, not an absence.
Winning is the payoff; removing it entirely punishes the player for a system
setting.

- Stage 0: the beat, unchanged.
- Stage 1: the foundation pulses become a **sequential bloom** — each foundation
  lights with `--win-bloom` for 200ms in turn, no scaling, no movement. The light
  sweep becomes a static 400ms full-table glow, fading in and out.
- Stage 2: **no cascade**. Instead the four foundation piles fade out over 900ms
  while the bloom expands behind them to fill the table, then fades.
- Stage 3: skipped.
- Stage 4: the panel **cross-fades** in rather than rising. Numbers appear at their
  final value, no count-up.

Total ~2.4s. Audio is unchanged (reduced motion is not reduced sound), so the
arpeggio still frames it.

If sound is also off, the sequence is entirely a slow, silent bloom — which is
genuinely quite beautiful, and was designed rather than fallen back into.

## Performance

This is 52 animated elements plus a full-screen canvas on a cheap Android. It will
be the hardest thing in the project to keep at 60fps.

- Cards are the **same 52 DOM elements** used during play — see
  [05 — Interaction & motion](05-interaction-and-motion.md). Nothing is created at
  win time; the physics loop writes `transform: translate3d(x,y,0) rotate(θdeg)` to
  elements that are already composited.
- All CSS transitions on cards are **removed** at cascade start. A transition
  fighting a per-frame transform write is the classic way this goes wrong.
- `will-change: transform` is applied to all 52 at the start of Stage 1 (when
  there's an 860ms window to absorb the layer promotion) and removed at Stage 3.
- The canvas is at DPR, capped at 2 — at DPR 3 on a large phone, the per-frame fill
  alone can miss frame budget, and the trails are soft enough that nobody can tell.
- **Graceful degradation**: the loop measures its own frame times, and every
  500ms that it dropped more than a quarter of them it gives up one rung of:
  1. Canvas DPR to 1.
  2. Trail fill to every other frame (alpha doubled).
  3. Launch interval lengthened so fewer cards are live at once.
  4. Trails off entirely.

  It never drops below "cards fall and bounce at 60fps", because that's the part
  that matters.

  A frame counts as dropped past **25ms**, not past 16.7. A healthy 60Hz frame
  *is* 16.7ms and measured `rAF` deltas sit a hair either side of it: on a
  headless Chromium holding a perfect 60fps, a third of frames measured 16.8ms,
  which was enough on its own to walk this ladder to "trails off" in two
  seconds on hardware that had not dropped a single frame.

  The quarter is deliberately late, and the ladder is on trust. Under
  Chromium's CPU throttling it changes measured frame times by **nothing** —
  at 2×, 4× and 6× the percentiles are identical whether it fires or not,
  because what throttling models is main-thread work for 52 composited
  elements and every rung here is canvas work. The rungs address memory
  bandwidth on a cheap GPU, which is a real cost on the target device and one
  no harness we have can simulate. At a tenth rather than a quarter it fired on
  a machine holding a 60fps median with occasional hitches, and stripped the
  trails to buy nothing measurable.

### The gate

Playwright traces the full sequence and fails the build on frame times, in two
runs, because one number cannot say both things:

| Run | Assertion | Measured |
| --- | --------- | -------- |
| Unthrottled | 95th percentile under one vsync | p50 16.7ms, p95 16.7ms, <1% dropped |
| CPU throttled 4× | **median** under one vsync | p50 16.7ms, p95 50ms, 29% dropped |

The second is the interesting one. A four-year-old mid-range Android is roughly
four times slower than the machine CI runs on; at that rate the cascade drops
frames — that is what the ladder is for — but the loop must still be *aiming*
at 60fps rather than settling into 30. Anything that doubles the per-frame cost
pushes that median to 33ms and fails.

This replaces the original bar, which was a 95th percentile under 16.7ms **on
the throttled profile**. That is not reachable and never was: percentiles of
`rAF` deltas quantise to multiples of a vsync, so a single missed frame inside
the top 5% puts p95 at 33.4ms, and at 4× the measured figure is 50ms with the
ladder engaged and 50ms with it disabled. The bar was a wish rather than a
measurement, and it is replaced here by the measurement.

## Why this shape

Worth recording, so it isn't relitigated:

- **The pause before it starts** is what makes it feel like a response rather than a
  cutscene.
- **Physics rather than a scripted animation** means it is different every time, and
  the sound follows the physics, so the *music* is different every time too. A
  scripted celebration is identical on the hundredth win; this isn't.
- **The cascade specifically** — rather than confetti or particles — because it is
  the single most recognisable animation in the history of personal computing, and
  because it is made of the cards you just spent four minutes arranging. Confetti is
  generic. Your own cards falling is not.
- **It gets built in Milestone 2**, not last. If it isn't extraordinary, the product
  isn't, and that's better to discover early. See the [roadmap](09-roadmap.md).
