# 02 — Game spec

The rules exactly as implemented. Where Klondike has genuine variation, the choice
is stated and justified. This doc is the contract the
[engine](03-engine.md) is tested against.

## The layout

```text
 ┌────┐ ┌────┐        ┌────┐┌────┐┌────┐┌────┐
 │stok│ │wast│        │ ♠  ││ ♥  ││ ♦  ││ ♣  │   foundations
 └────┘ └────┘        └────┘└────┘└────┘└────┘

 ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐
 │ 1  ││ 2  ││ 3  ││ 4  ││ 5  ││ 6  ││ 7  │      tableau
 └────┘└────┘└────┘└────┘└────┘└────┘└────┘
```

- **Stock** — the undealt remainder, face down.
- **Waste** — cards turned from the stock, face up. Only the top card is playable.
- **Foundations** — four piles, one per suit, built up A→K.
- **Tableau** — seven columns. Column *n* is dealt *n* cards; the last is face up,
  the rest face down.

Twenty-eight cards go to the tableau, twenty-four to the stock.

## Rules

### Winning

All 52 cards on the foundations. That is the only win condition; there is no
"you've lost" state, because with unlimited redeals and undo the player decides
when a deal is over.

### Foundations

- Build **up in suit** from Ace to King: A, 2, 3 … Q, K.
- A card may be moved from the tableau or the waste onto a foundation.
- **Cards may be moved back off a foundation** onto the tableau. Some
  implementations forbid this; it exists in the physical game, it is occasionally
  necessary to win, and forbidding it only creates a trap. Allowed.

### Tableau

- Build **down in alternating colour**: a red 7 goes on a black 8.
- **Any face-up run may be moved**, not just single cards — a properly sequenced
  run of any length moves as a unit. A partial run may be taken from anywhere
  within a sequence.
- **Only a King (or a run headed by a King) may be placed in an empty column.**
  The permissive "any card into a space" variant makes the game substantially
  easier and is not what people mean by Klondike. Standard rule.
- When a move exposes a face-down card, it **turns face up automatically**. This
  is not a player decision in any variant, so it is part of the move, not a
  separate move — which matters for undo.

### Stock and waste

- Tapping the stock turns **one card** (draw-1) or **three cards** (draw-3) to the
  waste, face up. Player's choice, in settings, remembered.
- In draw-3, the three cards are shown fanned, and **only the top one is playable**.
- If the stock is empty, tapping the empty stock space **recycles the whole waste**
  back to the stock, in order, face down.
- **Redeals are unlimited** in both modes. Since there is no score, limiting passes
  would only mean "you may no longer press this button", which is not a rule worth
  having.
- Draw-3 preserves offset: recycling does not reshuffle. The sequence of the stock
  is fixed at deal time and never changes.

### Draw-1 vs draw-3

Both ship. Draw-1 is roughly 80%+ winnable with perfect play; draw-3 is
substantially harder. Draw-1 is the default because the default should be the one
that feels good to a casual player on a bus.

Changing draw mode mid-game starts a new deal (with a confirm), because the two
modes make different games out of the same seed.

## Deals

### Deal numbers

Every deal has a number: an unsigned 32-bit integer, displayed in decimal.
The same number always produces the same deal, forever. This is a
**frozen invariant** — the shuffle algorithm can never be changed once released,
only added to as a new named generator. See [03 — Engine](03-engine.md).

A deal number is shareable as a URL: `/?deal=1234567` (and `&draw=3`). Opening
that URL deals exactly that game.

### Winnable-only

A setting, **on by default**. When on, "new deal" picks from a pre-verified pool of
deals that are known to be winnable with perfect play.

The pool is generated at build time by running a solver over candidate seeds and
keeping the ones that solve; the site ships the list, not the solver. Separate
pools for draw-1 and draw-3, since winnability differs.

When off, deals are drawn from the whole 2³² space and some are unwinnable — which
is the honest version of the game, and some people want it.

This is a strictly more generous default than MSC, which does not offer it at all.

### The daily deal

One deal per calendar day, the same for everyone, picked deterministically from the
winnable pool by date. No server: the date is the input, the pool is static, so
every visitor computes the same answer.

- Local streak counter: consecutive days the daily was completed.
- The streak is **never used to nag**. No notifications, no "don't lose your
  streak!" modal, no red badge. It is a number on the stats screen.
- Breaking a streak costs nothing and is not commented on.
- Days are in the player's **local timezone**. A shared global midnight would be
  correct for a leaderboard, and we don't have one.

## Assists

All four ship. Klondike's difficulty should come from the deal, not from the
interface being stingy.

### Unlimited undo

Any number of moves, back to the deal. Undo restores the exact prior state
including which cards were face up, the stock/waste split, and the clock is *not*
rewound (time is honest; moves are forgiving).

No redo in v1 — it doubles the state surface for a rarely-wanted action. Revisit if
it's missed.

### Hints

On request, highlights one available move, best-first. The ranking heuristic:

1. A move that turns over a face-down tableau card (most valuable — it's information).
2. A move that empties a column, when a King is available to fill it.
3. Waste → tableau, when it unblocks.
4. Tableau → foundation, *unless* the card may still be needed to build on
   (don't advise sending up a card whose opposite-colour neighbours are still buried).
5. Drawing from the stock, when nothing else exists.

If no move exists other than drawing, and drawing cannot help (all stock seen, no
legal moves), the hint says so plainly: **"No moves left — undo, or try a new
deal."** Not a "you lose" screen.

Hints do not consume anything and are not limited.

### Auto-complete

When **no face-down tableau cards remain**, the game is guaranteed winnable —
everything is visible and the stock can be cycled freely — so a single
**Finish** button appears and sends every remaining card home.

It is offered, never forced. Pressing it plays a fast cascading run of moves
(~40ms apart, accelerating) that flows straight into the
[win sequence](06-win-sequence.md) without a break. The auto-complete *is* the
opening beat of the win, not a skip of it.

### Replay and restart

- **Replay this deal** — same seed, same draw mode, from the start. Clock and
  moves reset. Your previous best on this deal is shown so you're racing yourself.
- **New deal** — a fresh seed, honouring the winnable-only setting.

Both are one tap with no confirmation if the current game has fewer than ~5 moves
made, and a confirm otherwise.

## Time and moves

No score. Nothing is multiplied by anything.

- **Time** — counts up from the first move, not from the deal. Pauses when the tab
  is hidden. Displayed as `m:ss`, or `h:mm:ss` past an hour.
- **Moves** — a count of player-initiated moves. Auto-turnover of an exposed card
  is part of the move that exposed it. Drawing from the stock counts as a move.
  Recycling the waste counts as one move. Undo does **not** decrement the count —
  it is a record of what you did, not a score to optimise by cheating.

The timer can be hidden entirely in settings, for people who find a clock stressful.
Time is still recorded.

### Records kept (locally)

- Per deal number: best time, fewest moves, whether completed.
- Lifetime, per draw mode: games played, games won, win rate, best time, fewest
  moves, current and longest daily streak.
- Nothing is ever shown as a loss. "Games played" and "games won" are both facts;
  there is no losses column.
