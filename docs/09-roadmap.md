# 09 — Roadmap

Milestones, in build order, with an explicit bar for each. A milestone is done when
its bar is met, not when its code exists.

The ordering has one unusual property: **the win sequence is built second**, before
most of the game is playable. That's deliberate — it is the differentiator and the
hardest technical risk in the project, and discovering in month three that it can't
hit 60fps on a cheap Android would invalidate a lot of work. It gets prototyped
against a fake win before there's a real one to celebrate.

---

## M0 — Engine

Pure TypeScript, no DOM, no UI. Everything in [03](03-engine.md) except the solver.

- Card representation, `GameState`, the frozen RNG and deal.
- `isLegal` / `applyMove` covering every rule in [02](02-game-spec.md).
- `legalMoves` enumeration.
- Snapshot-based undo.
- The full `test/` suite: golden deals, rule coverage, the property test.

**Bar**: a complete game of Klondike can be played to a win from a Node REPL, and
the property test survives 1,000 seeds × 200 random moves with no invariant
violation. The golden deal test is committed and never changes again.

---

## M1 — The board, playable

The minimum that is recognisably solitaire: deal, drag, drop, draw, win detection.

- Astro page + Svelte island, `CardLayer` with its 52 persistent elements.
- `Layout.ts` — viewport to measurements, phone portrait only.
- Pointer drag with capture, hit-testing, snap-back.
- Tap-to-auto-move.
- One theme (Warm), one deck (whichever is fastest to wire — probably Classic).
- Undo button.

**Bar**: a full game is playable on a real phone, by touch, without anything feeling
broken. Not pretty yet. 60fps while dragging.

---

## M2 — The win sequence

The risky part, early. See [06](06-win-sequence.md).

- All five stages, with a debug trigger so it can be run without winning.
- Canvas trail layer, physics loop with fixed timestep, deterministic test mode.
- WebAudio synthesis: the arpeggio and the pentatonic bounce notes.
- The reduced-motion alternative, built at the same time — not retrofitted.
- Graceful degradation ladder.
- Playwright performance trace on a throttled profile.

**Bar**: it holds 60fps through the full cascade on a real mid-range Android, and
three people who see it unprompted react to it. That second criterion is soft and
it's the one that matters; if nobody reacts, the sequence goes back to the drawing
board while it's still cheap to change.

The mechanised half is met: all five stages run in order on a real build, the
sequence is skippable at any moment, the reduced-motion alternative is built,
and `e2e/performance.pw.ts` holds the frame-time gate in
[06](06-win-sequence.md) — which that doc now states as a measurement rather
than the wish it was written as. The two halves that are not met are the two
that need hardware and people: a trace on an actual mid-range Android, and the
three unprompted reactions. Both are outstanding, and the second is the one
that decides whether any of this was right.

---

## M3 — Feel

The polish pass that turns M1's "works" into "nice". This is where the
[motion](05-interaction-and-motion.md) catalogue lands.

- The timing and easing scales; every move animation in the table.
- The deal stagger, the real card flip, the draw-3 fan, the waste recycle sweep.
- Drop settle with overshoot, illegal-move shake, long-press peek.
- Card movement and foundation sounds.
- Auto-move heuristic tuning — the flagged uncertainty from
  [07](07-architecture.md). Judged by playing fifty games, not by reasoning.

**Bar**: a hundred consecutive moves with nothing that feels wrong, slow, or
surprising. The auto-move heuristic picks the move you wanted ≥ 95% of the time.

Built: the timing and easing scales, every motion in the catalogue — the deal
stagger, the real flip, the draw fan, the recycle sweep, the drop settle, the
illegal-move shake, the slower undo — the long-press peek, and both sounds, on
the same audio graph as the win sequence.

The auto-move heuristic has been *measured* rather than tuned, because it
turned out there was nothing to tune. `scripts/audit-automove.ts` plays a
greedy player's games twice over the same deals, once playing its moves and
once tapping the cards those moves name; the tapped run wins slightly more, and
the tie-break the design flagged as arbitrary fires on under 1% of taps and is
worth nothing whichever way it goes. See the note in
[07](07-architecture.md#what-isnt-decided-yet).

What is outstanding is the bar itself, both halves of it: a hundred consecutive
moves that feel right, and the 95% judgement. Neither is mechanisable — they
are this milestone's version of M2's three unprompted reactions, and they need
someone playing fifty games.

---

## M4 — Themes and decks

- The three tables from [04](04-art-direction.md), fully tokenised.
- Our own decks: Minimal, High-contrast, Four-colour.
- Sourced decks wired in, with `LICENSE` files and the `/credits` page.
- Card backs.
- Settings sheet.
- Visual regression screenshots across theme × deck × viewport.

**Bar**: every theme passes the contrast table in [08](08-accessibility.md), the
Minimal deck is legible at 46px (the flagged open question — if it isn't, a sourced
deck becomes the phone default), and every licence obligation is honoured on a page
a user can reach in two taps.

Built: the three tables, our three decks and the three backs — all of them sets
of custom properties rather than assets — the settings sheet that switches
them, one sourced deck with its licence, `/credits`, and the visual suite.

Two of the three halves of the bar are met and mechanised. The contrast table
is asserted by `test/themes/`, which reads the stylesheets and composites the
translucent tokens rather than trusting the values as written; writing it found
three things the docs had wrong, and all three are now fixed in both places.
The licence obligations are honoured on `/credits`, two taps from the game,
generated from the same registry the card layer loads decks out of so that a
deck cannot ship without appearing there.

What the milestone *changed* is which decks exist. Classic, the doc's safe
default, is 8MB of traced bitmaps and cannot ship at all; Traditional cannot be
sourced from anywhere we can verify, and its licence has an exact obligation,
so it waits. French ships, and at 339KB it is a download rather than a default
— which is only acceptable because the default deck is ours and costs nothing.
See [04](04-art-direction.md).

Outstanding is the middle clause, and it is a judgement rather than a test: is
the Minimal deck legible at 46px? The arithmetic is suggestive — its index is
0.36 × the card width, about 17px at a 46px card, against the ~5px of the
sourced deck's own index, which is why that one gets ours drawn over it — but
"legible at arm's length with reading glasses off" is answered by holding a
phone, not by a ratio. The visual baselines are where to look.

---

## M5 — Deals, persistence, stats

- The build-time solver and the generated winnable pools.
- Winnable-only setting, deal numbers, `?deal=` URLs, share. (Reading
  `?deal=` landed in M1 — it is three lines on top of `fromSeedUrl`, and
  without it every interaction test is a coin toss. The share button, the
  winnable pool and the daily are still here.)
- The daily deal and its streak.
- `localStorage`: settings, resume-in-progress, lifetime stats, per-deal records.
- Stats sheet. Result panel wired to real records.
- Hints and Finish.

**Bar**: the solver's replay test passes on every pooled seed. A game survives a
refresh, a browser restart, and a corrupted storage key. `localStorage` being
unavailable entirely does not break the game.

Built: the solver and the two 10,000-deal pools it writes, the winnable-only
setting, the daily and its streak, `localStorage` for the settings, the game in
progress, the lifetime counters and the per-deal bests, the statistics sheet,
the record line and the share button the result panel was drawn with, and the
two assists that were waiting on a pool and a stopwatch — Hint, and Finish.

It is also the first milestone whose bar a machine can hold all of.

The solver is a depth-first search with the four things [03](03-engine.md)
names, and one it didn't: the transposition key **sorts the columns**, so two
boards that differ only in which column a run sits in are one position. At a
200,000-node budget it settles about three-quarters of draw-1 deals and a little
over half of draw-3 ones, which is what makes 10,000 seeds per mode a couple of
machine-hours rather than a couple of days.

Every pooled seed's winning line is replayed through `applyMove` before it goes
in the file, `--verify` re-runs that over a committed pool, and
`test/engine/solve.test.ts` re-derives a sample on every test run. That is the
first clause, met three times over, and it is the one that matters: a solver
that wins by a move the rules forbid would ship a pool that promises deals
nobody can win.

The second and third clauses are `e2e/persistence.pw.ts`: a game reloaded out of
storage comes back to the same fifty-two transforms with its undo stack intact,
a corrupt save and a save from another schema version are both just a new game,
and a browser that throws on the very mention of `localStorage` plays exactly as
well as one that doesn't. "A browser restart" is the one phrase a test cannot
say literally — nothing in the save is session-scoped, so a restart is a reload
as far as any of this is concerned.

Two things this milestone changed:

- **`dailySeed` and `randomWinnableSeed` are not on the engine's public
  surface**, where [03](03-engine.md) put them. One needs `Date` and the other
  needs a `fetch`, and `test/engine/purity.test.ts` refuses both. They live in
  `src/game/pool.ts` as pure functions of a pool handed to them, which is also
  what lets the daily's mapping be pinned by a test rather than trusted.
- **The bottom bar's middle slot is the assist**, which is what
  [05](05-interaction-and-motion.md) always drew: Hint, and Finish once the
  board has proved it cannot get stuck. New deal moved into the `⋯` menu with
  the daily, replay and the statistics — one tap further away, and over about
  five moves it asks first, which is the one kind of modal
  [01](01-product-brief.md) allows.

What is *not* claimed: that the pool is every winnable deal. A deal the solver
cannot crack inside its budget is discarded rather than marked unwinnable, so
the pools are deals that are winnable **and findable**, and the hardest quarter
of winnable draw-1 deals is not in them. For a setting whose whole job is "deal
me one I can win", that bias points the right way — but it is a bias, and
[03](03-engine.md) says so where the format is defined.

---

## M6 — Desktop, accessibility, ship

- Desktop layout, hover states, keyboard shortcuts.
- The full keyboard model and screen-reader work from [08](08-accessibility.md).
- Landscape, tablet, the Large card-size setting.
- `/how-to-play`.
- `axe-core` gate, the keyboard-only win test, manual VoiceOver and TalkBack passes.
- Performance budget enforced in CI.

**Bar**: a complete game can be won using only a keyboard, and only a screen reader.
Zero axe violations. Cold-load to first card moved under two seconds on throttled
4G.

**This is v1.** It ships.

Built: the keyboard model and the screen-reader model, which turned out to be
one model — a roving focus over thirteen piles, where moving it is both how a
keyboard gets around and how a screen reader is told where it is. The board
keeps its thirteen empty slots and they became thirteen named buttons; `Tab`
still never enters the card layer. `?` opens the shortcut list, the desktop
gets its one bar and its hover lift, landscape gets the same bar for the
opposite reason, the Large card size pages the tableau, and `/how-to-play`
writes the rules down.

Three of the four halves of the bar are met and mechanised:

- **A complete game can be won by keyboard alone.** `e2e/keyboard.pw.ts` wins
  deal 3 in Chromium with nothing but key presses, and
  `test/game/keyboard.test.ts` types the same winning line through the pure
  model with no browser in it, in both draw modes.
- **Zero axe violations**, on eleven surfaces: the board on all three tables,
  the board with a card in hand, the Large board and its pager, the menu, the
  statistics, the shortcut list, the result panel, `/credits` and
  `/how-to-play`.
- **Under two seconds on throttled 4G** — 793ms, or 852ms with a cheap phone's
  processor behind it as well. It is now a measurement rather than the
  inference from a bundle size it used to be; see
  [07](07-architecture.md#first-paint), where the size limit has been loosened
  to 60KB and given the smaller job of bounding growth.

The fourth is **only a screen reader**, and it is this milestone's version of
M2's three unprompted reactions: it needs VoiceOver on an iPhone and TalkBack
on an Android, and it is not a thing automation can answer. Everything it
depends on is built and tested as far as a machine can test it — every pile
names itself in full, every move is announced, the win is announced at Stage 0
rather than after thirteen seconds of cascade, and a pile can be activated by a
double-tap because on a phone that gesture is the whole interaction. What no
test here can tell you is whether the speech is *bearable* over a fifty-move
game. Until somebody has played one that way, this half is a claim rather than
a fact.

Four things the milestone changed, all recorded where they were decided:

- **The JS budget was a proxy, and it was wrong by more than half.** See above.
- **The clock's contrast row in [08](08-accessibility.md) contradicted the
  WCAG 2.2 AA that document opens by targeting.** It allowed 3:1 for
  "deliberately dim" text; the Minimal chrome was at 3.87:1 and it is ordinary
  15px text. Found the first time the axe gate was pointed at a light table.
- **Landscape's left rail was not built.** One bar gets most of the height back
  for none of the cost of a third chrome arrangement, for the one orientation
  [05](05-interaction-and-motion.md) opens by saying nobody uses.
- **The Large card size needed a second row at the top**, which the design had
  not foreseen: the top row is as wide as the tableau, so a card too big for
  seven columns is too big for the six piles above them — and those cannot page
  with it, because they are where every move ends up.

What is *not* claimed: that this ships. Three things stand between here and
that, and two of them are the manual passes above. The third is the accumulated
soft half of every milestone since M2 — the three unprompted reactions, the
hundred moves that feel right, the 95% auto-move judgement, the Minimal deck at
46px. None of them is code, all of them need somebody playing the game, and a
v1 that ships without them is a v1 nobody has played.

---

## After v1

Not committed to, in rough order of appeal:

- **Export/import a save file.** JSON download and upload, so stats can move between
  devices without there being an account. The honest version of sync.
- **Windows deal-number compatibility** as a second named generator, so people can
  replay the deal they remember from 1998. See [03](03-engine.md).
- **Statistics worth reading** — a distribution of your times, which deals you've
  beaten, a heatmap of the daily.
- **A second game.** Spider is the natural next one (it's the other tableau-building
  game, so the engine abstraction is a modest extension rather than a rewrite);
  FreeCell after that. Pyramid and TriPeaks need a genuinely different interaction
  model and are a much bigger piece of work.
- **More decks**, particularly a historic public-domain deck sourced from museum
  scans — visually distinctive in a way no vector deck is, but the pip cards in old
  decks are inconsistent and it's real restoration work.
- **Offline**: a service worker making the site fully playable with no connection.
  Deliberately *not* in v1 — a service worker is a permanent cache-invalidation
  liability and the site is small enough that a normal HTTP cache gets most of the
  benefit.
- **i18n**, starting with Norwegian. The string module from
  [08](08-accessibility.md) makes this mechanical apart from card names.

## Never

Restating from [01](01-product-brief.md), because roadmaps are where principles go
to die:

Ads. Accounts. Analytics. A server. Leaderboards. XP, levels, currencies, daily
rewards, achievements, notifications. Anything that makes the player feel they owe
the site something.
