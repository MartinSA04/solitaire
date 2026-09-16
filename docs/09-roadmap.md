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
