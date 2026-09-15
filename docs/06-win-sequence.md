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
- **Initial velocity**: `vx` ∈ ±(180…420) px/s, biased *away* from the nearest
  screen edge so cards travel across the board rather than immediately off it.
  `vy` ∈ −(120…260) px/s — a slight upward toss before gravity takes them.
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

1. Fill the whole canvas with the table colour at **α = 0.055**. This is the entire
   trail mechanism — old frames fade exponentially rather than being erased, leaving
   a soft ~20-frame comet tail.
2. For each live card, paint a rounded rect in the card's dominant colour at low
   alpha at its current position.

Cost: one full-canvas fill plus 52 small fills per frame. Trivially affordable, and
the fade is free because it's the same operation as the clear.

The trail colour is the card's, not the accent's — so red cards leave warm trails
and black cards leave dark ones, and the screen fills with colour that came from the
deck.

In the **dark theme** the trails additionally composite with `lighter`, which is
where the "firework" reading comes from and why that theme was designed for this
moment.

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

The panel is dismissible; behind it, the empty table with a fresh deal already
available.

## Skipping

A tap anywhere during Stages 1–3 jumps straight to Stage 4:

- Physics loop stops, cards cull instantly.
- The canvas fades over 180ms rather than cutting.
- Audio voices release over 120ms rather than stopping dead.
- The panel rises normally.

Total skip-to-panel: ~300ms. It must feel like a choice, not like an interruption
being punished.

A **"skip"** affordance appears at the top-right after 2 seconds of cascade, at low
opacity — for the person who doesn't know the whole screen is tappable.

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
- **Graceful degradation**: the loop measures its own frame times over the first
  500ms of cascade. If it's missing budget, it drops in order:
  1. Canvas DPR to 1.
  2. Trail fill to every other frame (alpha doubled).
  3. Launch interval lengthened so fewer cards are live at once.
  4. Trails off entirely.

  It never drops below "cards fall and bounce at 60fps", because that's the part
  that matters.
- Playwright traces the full sequence on a throttled CPU profile and fails the build
  if the 95th-percentile frame time exceeds 16.7ms.

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
