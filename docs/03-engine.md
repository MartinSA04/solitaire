# 03 — Engine

The game core: pure TypeScript, no DOM, no timers, no randomness that isn't seeded.
It is a library that a UI happens to render. This is not architectural purity for
its own sake — it is what makes the engine testable under `node --test`, makes the
build-time solver able to import the same rules the browser runs, and keeps the
[win sequence](06-win-sequence.md) free to do whatever it likes to the pixels
without the rules noticing.

## Shape

```text
src/engine/
  card.ts        Card, Suit, Rank — and the 52-card deck
  state.ts       GameState, the pile model
  deal.ts        seed → GameState
  rng.ts         the frozen PRNG + shuffle
  moves.ts       Move, legality, application
  enumerate.ts   all legal moves from a state (hints, solver, auto-complete)
  history.ts     undo stack
  index.ts       the public surface
```

Nothing in `src/engine/` may import from `src/ui/`, and nothing in it may touch
`window`, `Date.now()` or `Math.random()`. A lint rule and a unit test both enforce
this — the test simply imports the engine in a bare Node context and runs a full
game.

## Cards

A card is an integer, `0..51`, not an object.

```ts
// rank = card % 13  (0 = Ace … 12 = King)
// suit = (card / 13) | 0  (0 = ♣, 1 = ♦, 2 = ♥, 3 = ♠)
// red  = suit === 1 || suit === 2
```

Reasons: piles become `Uint8Array`-friendly, state snapshots for undo are cheap,
the solver can hash positions fast, and equality is `===`. Human-readable
conversion (`"7♥"`) lives in one debug helper and in the asset lookup, nowhere
else.

Face-up-ness is **not** on the card — it is a property of position. The tableau
stores a per-column count of face-down cards, which is the only place the
distinction exists.

## State

```ts
type GameState = {
  stock: Card[];          // face down, index 0 = next to be drawn
  waste: Card[];          // face up, last = top/playable
  foundations: Card[][];  // 4, indexed by suit, ascending A→K
  tableau: {
    cards: Card[];        // bottom → top
    down: number;         // how many of the leading cards are face down
  }[];                    // 7
  drawCount: 1 | 3;
  seed: number;           // the deal number
  moves: number;
};
```

`down` is always `<= cards.length`. When a move leaves `down === cards.length` and
`cards.length > 0`, the top card flips: `down -= 1`. That is the whole turnover
rule and it lives in exactly one function.

State is treated as immutable from the outside: `applyMove` returns a new state.
Internally it may structurally share the piles it didn't touch.

## Deals, seeds and the frozen shuffle

A deal number is a `uint32`. The pipeline is:

```text
seed → mulberry32(seed) → Fisher–Yates over [0..51] → deal 28 to tableau, 24 to stock
```

`mulberry32` because it is eleven lines, has no dependencies, passes gjrand's
smallcrush, and — critically — is trivial to reimplement identically if this
project is ever rewritten. Quality beyond that is irrelevant: we need 2³²
distinguishable shuffles, not cryptography.

Fisher–Yates runs **backwards from index 51**, taking `j = next() % (i + 1)`. The
modulo bias is real and irrelevant here; what matters is that it is written down.

### The invariant

> **The mapping from deal number to deal is frozen at first release and can never
> change.** Not the PRNG, not the direction of the shuffle, not the modulo, not the
> order cards are dealt into the columns.

Players share deal numbers. Personal bests are keyed by deal number. A changed
shuffle silently invalidates both. A golden test file — `test/deal.test.ts` — pins
the full 52-card layout for a fixed list of seeds including `0`, `1`, `2**32 - 1`
and a few arbitrary ones. If that test fails, the change is wrong, not the test.

If a different generator is ever genuinely needed, it ships as a *named* second
generator and deal numbers carry a prefix. It does not replace this one.

### Windows deal-number compatibility (deferred)

Classic Windows Solitaire deal numbers (1–1,000,000) come from `srand(n)` plus the
MSVC LCG. Supporting them as an alternate generator would let people replay the
deal they remember. Nice, not v1. Noted in the [roadmap](09-roadmap.md) so the
seed format leaves room for it.

## Moves

```ts
type Move =
  | { kind: "draw" }                                    // stock → waste
  | { kind: "recycle" }                                 // waste → stock
  | { kind: "wasteToTableau";      to: number }
  | { kind: "wasteToFoundation" }
  | { kind: "tableauToTableau";    from: number; to: number; count: number }
  | { kind: "tableauToFoundation"; from: number }
  | { kind: "foundationToTableau"; suit: number; to: number };
```

Deliberately *not* "card X to pile Y" — the move names a source pile and a count,
so it is unambiguous, compact, and validates without searching for the card.
`count` on `tableauToTableau` is how many cards from the top of `from` are moving.

Two functions, and every rule in [02](02-game-spec.md) lives in them:

```ts
function isLegal(state: GameState, move: Move): boolean;
function applyMove(state: GameState, move: Move): GameState;  // throws if illegal
```

`applyMove` is total over legal moves and does the turnover. It increments `moves`.
It does not touch the clock — time is the UI's problem.

## Enumeration

```ts
function legalMoves(state: GameState): Move[];
```

One function, used by three consumers with different needs:

- **Hints** rank its output with the heuristic in [02](02-game-spec.md).
- **Auto-complete** filters it to foundation moves and runs them to fixpoint,
  which is exhaustive because it is only ever offered on a board where that is
  enough — see [02](02-game-spec.md).
- **The solver** searches over it.

It returns moves in a deterministic order so the solver is reproducible. It
deliberately includes moves a player would never want (like pulling a card back off
a foundation) because the solver needs them.

One subtlety worth pinning: moving a run within the tableau to a column where the
*same* move is available on two different columns produces two distinct `Move`s.
The solver dedupes by resulting-state hash, not by move.

## The solver, and where it runs

Winnable-only deals need something that can decide "is this deal solvable with
perfect play". Klondike is hard here — the search space is large, draw-3 especially,
and a naive DFS will not terminate on interesting positions.

**It does not run in the browser.** It runs at build time, in Node, and the site
ships its *output*.

```text
scripts/generate-winnable.ts
  for seed in candidates:
    if solve(deal(seed, draw)) == SOLVED: keep
  → src/data/winnable-1.bin
  → src/data/winnable-3.bin
```

### Approach

Depth-first search with:

- **Transposition table** — hash the state (piles + face-down counts + stock
  rotation), skip seen positions. This is the single biggest win.
- **Forced-move collapse** — apply obviously-safe moves (an Ace or a 2 to
  foundation is never wrong) without branching.
- **Move ordering** — turnover-producing moves first, since they're what progress
  looks like.
- **A node budget per seed.** If the search exceeds it, the seed is discarded as
  *unknown*, not recorded as unwinnable. A pool of known-good deals doesn't need to
  be exhaustive, so we can be lazy where the game is hard.

### Output format

A packed `Uint32Array` of seeds, ~10,000 per draw mode, sorted. 40KB each, which
is fine, and gzips well. Picking a new deal is an index into it; picking the daily
is `hash(YYYY-MM-DD) % length`.

A pool that size means a daily player sees no repeat for 27 years, and a random
player will essentially never notice the pool is finite. If that ever feels small,
regenerating a larger pool is a build-time cost only — but note that **the daily
deal for a given date must not change when the pool is regenerated**, so the daily
indexes into a frozen first 4,096 entries that are append-only.

### Testing the solver

The solver is the one component where "it compiles" is meaningless. It gets:

- Known-solvable positions from published Klondike test sets, asserted solvable.
- Trivially-unsolvable constructed positions, asserted unsolvable.
- A replay test: for a sample of pool seeds, re-run the solver's move list through
  `applyMove` and assert it reaches 52 on the foundations. This catches the
  dangerous failure — a solver that says "winnable" via a move the real rules
  forbid.

## Undo

The naive approach (store a `Move`, invert it) is wrong here because turnover is
lossy: undoing a move must restore a card to face-*down*, and the move doesn't
record whether it caused a flip.

Instead the history stores full snapshots. With cards as integers, a `GameState`
snapshot is ~60 bytes of arrays; a 500-move game is trivial memory. Simplicity beats
cleverness and undo is never subtly wrong.

```ts
type History = { states: GameState[]; };  // states[0] is the deal
```

Undo pops. The deal itself is `states[0]`, so undo-to-start is free and "replay this
deal" is the same operation.

## Public surface

```ts
export function newGame(seed: number, drawCount: 1 | 3): Game;
export function fromSeedUrl(params: URLSearchParams): Game | null;
export function dailySeed(date: Date, drawCount: 1 | 3): number;
export function randomWinnableSeed(drawCount: 1 | 3): number;

interface Game {
  readonly state: GameState;
  readonly canUndo: boolean;
  readonly isWon: boolean;
  readonly canAutoComplete: boolean;   // every card face up in the tableau
  play(move: Move): boolean;           // false if illegal; never throws
  undo(): boolean;
  hint(): Move | null;
  autoCompleteSequence(): Move[];      // the ordered finishing run
  serialise(): string;                 // for localStorage
}
```

`play` returning `false` rather than throwing is deliberate: the UI will
speculatively try moves (a tap means "do the obvious thing here"), and that should
not be exceptional.

## Testing strategy

`test/**/*.test.ts` under `node --test`, per the repo invariant.

| Area          | What's asserted                                                        |
| ------------- | ---------------------------------------------------------------------- |
| `rng`         | Golden values for fixed seeds. Frozen forever.                          |
| `deal`        | Golden full layouts for fixed seeds. Frozen forever. 28/24 split.       |
| `moves`       | Every rule in [02](02-game-spec.md) has a positive and a negative test. |
| `moves`       | Turnover happens exactly when it should, and never otherwise.           |
| `enumerate`   | Enumerated moves are all legal; no legal move is missed (brute force on small constructed states). |
| `history`     | Undo to arbitrary depth reproduces byte-identical state.                |
| `invariants`  | Property test: from 1,000 random seeds, play 200 random legal moves and assert all 52 cards are present exactly once, `down <= length`, foundations ascend in suit. |
| `solver`      | As above.                                                               |
| `purity`      | The engine imports and runs a full game with `window` undefined.        |

The property test is the one that finds real bugs. Card conservation and foundation
ordering are cheap to check and catch almost every class of mistake an engine like
this makes.
