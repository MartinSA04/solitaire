# Design docs

The design for [solitaire.martinsundal.no](https://solitaire.martinsundal.no/) —
written before the code, and meant to be argued with.

Read them in order the first time; after that they stand alone.

| #                                     | Doc                  | What it settles                                                                |
| ------------------------------------- | -------------------- | ------------------------------------------------------------------------------ |
| [01](01-product-brief.md)             | Product brief        | What we're building, who for, and the things we refuse to do                    |
| [02](02-game-spec.md)                 | Game spec            | Klondike rules as implemented, deals, seeds, the daily, assists                 |
| [03](03-engine.md)                    | Engine               | The pure-TypeScript game core: state, moves, RNG, solver, undo                  |
| [04](04-art-direction.md)             | Art direction        | Three table themes, the deck themes, and where the card art comes from          |
| [05](05-interaction-and-motion.md)    | Interaction & motion | Mobile-first layout, touch and pointer grammar, the motion language             |
| [06](06-win-sequence.md)              | Win sequence         | The signature win state, stage by stage, with timings                           |
| [07](07-architecture.md)              | Architecture         | Astro + island choice, file layout, persistence schema, testing strategy        |
| [08](08-accessibility.md)             | Accessibility        | Reduced motion, colour vision, keyboard, screen readers, targets                |
| [09](09-roadmap.md)                   | Roadmap              | Milestones, and what is explicitly deferred                                     |

## Status

[Milestone 0](09-roadmap.md) is built: `src/engine/` is the rules from
[02](02-game-spec.md) as the pure library described in [03](03-engine.md),
with the test suite that doc specifies. Everything a player can see is still
design only — see the [roadmap](09-roadmap.md) for the order it gets built in.

## Decisions already made

These came out of a scoping conversation and are settled unless revisited
deliberately. Everything else in these docs is a proposal.

- **Klondike only** in v1, done to a very high standard, rather than a shallow
  suite of five games.
- **Deck themes are cosmetic** — card faces, card backs and table surface. No
  rule-changing "decks".
- **Mobile-first**, desktop fully supported and designed second.
- **Full local persistence**: resume mid-game, lifetime stats, settings.
- **Seeded deals**, a winnable-only option, and a daily deal.
- **No score**. Time and moves only.
- **Assists are generous**: unlimited undo, hints, auto-complete, replay-this-deal.
- **Subtle sound only** — movement and the win. No music.
- **The win sequence is the product's signature** and gets a doc to itself.
- **Card art is sourced, not drawn** — open-licensed decks, attributed properly.
