# 01 — Product brief

## The one-sentence version

The Klondike you'd build if nobody had to make money from it.

## Why this exists

Microsoft Solitaire Collection is the most-played implementation of the most-played
card game in the world, and it is a worse product than the one that shipped with
Windows 3.1 in 1990. A game of Klondike on it involves a video ad before you play,
a banner while you play, a "double your coins" interstitial when you win, a daily
login streak, a battle pass, an XP bar, a premium currency, and a subscription
upsell to remove some — not all — of the above.

None of that makes the solitaire better. All of it exists to convert attention into
revenue, and it works, which is why nobody with a business model is going to stop.

That is the opening. We have no business model. So we can spend the entire budget
on the part people actually came for: laying out cards, moving them well, and the
moment you win.

## Who it's for

Someone with four minutes and a phone. They are in a queue, on a bus, or avoiding
something. They want to open a URL and be playing in under two seconds, with no
account, no consent dialog, no tutorial, and no idea that the site has settings
until they go looking.

They are not a "player" in the retention sense. We do not want them to come back
daily out of guilt. We want them to come back because it was nice.

Secondary: someone on a desktop with a keyboard who wants a fast, low-friction
Klondike in a browser tab, and who will discover the keyboard shortcuts.

## What "competing with Microsoft Solitaire Collection" means

Not feature parity. MSC has five games, cloud saves, achievements, leaderboards,
events and Xbox integration. We will not have any of that and should not want it.

We compete on the four things a solitaire player actually experiences:

1. **Time to first card moved.** Theirs is ~15–40 seconds including an ad. Ours
   should be under two.
2. **How a card feels to move.** Drag latency, snap behaviour, whether a wrong drop
   punishes you, whether the game guesses right when you tap.
3. **Whether the board is beautiful.** Theirs is competent and busy. Ours should be
   quiet and considered, and should let you choose a look you like.
4. **The win.** Theirs is a coin animation and an upsell. Ours is the reason to
   tell someone about the site.

If we win on those four and have one game to their five, we win.

## Principles

**No ads. No accounts. No tracking. Ever.** This is the premise, not a phase.
There is no analytics script, no consent banner (because there is nothing to
consent to), and no network request after the page loads. It should be possible to
play the whole game with the device in airplane mode after first load.

**The game is the product; the chrome is furniture.** Every pixel of UI that is not
a card has to justify itself. Default state shows the board, a clock, a move count
and three buttons.

**Never punish, never nag.** No score to lose, no streak to break, no "are you sure
you want to leave", no rating prompt, no modal that isn't a direct response to
something the player just pressed. Undo is unlimited because losing a game to a
misclick is not interesting difficulty.

**Deterministic and inspectable.** Every deal has a number. The same number always
produces the same deal, forever. You can share it, replay it, and beat your own
time on it.

**Fast on a bad phone.** The performance target is a four-year-old mid-range
Android, not a MacBook. If the win sequence drops frames there, the win sequence is
wrong, not the phone.

**Sourced, credited, licensed.** The card art is other people's work. We use decks
whose licences allow it and we attribute them prominently, not in a buried
footer. See [04 — Art direction](04-art-direction.md).

## Non-goals

Stated so they don't creep back in:

- **No ads, ever**, including "tasteful" ones, affiliate links, or a donate nag.
- **No accounts, logins, or cloud sync.** Progress lives in the browser and is
  the player's. Exporting it is a [roadmap](09-roadmap.md) item, not a service.
- **No server.** The site is static files on GitHub Pages. No API, no database,
  no serverless function. This is a hard architectural constraint, not a
  preference — see [07 — Architecture](07-architecture.md).
- **No analytics**, no error reporting, no fonts or scripts from a third-party
  origin. Zero outbound requests at runtime.
- **No leaderboards or social features.** Sharing a deal number is a URL, not a
  platform.
- **No engagement mechanics**: no XP, no levels, no currencies, no daily-login
  rewards, no achievements, no notifications.
- **No other games in v1.** Spider, FreeCell, Pyramid and TriPeaks are plausible
  later and the engine should not make them impossible, but designing for them now
  would compromise the Klondike.
- **No tutorial.** Klondike is discoverable. A short "how to play" page is enough.

## How we'd know it worked

There is no analytics, so these are qualitative and that's fine:

- A stranger can go from cold URL to first card moved in under two seconds on 4G.
- Someone who plays Klondike daily on their phone switches to it and doesn't switch
  back.
- Someone sends the win animation to a friend.
- Playing it feels calm.

## Risks worth naming now

- **The win sequence is the whole differentiator and it is the hardest thing in the
  project.** It is 52 animated objects at 60fps on a cheap phone. If it is merely
  fine, the product is merely fine. It gets its own doc and it gets built early, not
  last — see [06](06-win-sequence.md) and the [roadmap](09-roadmap.md).
- **Sourced card art constrains the visual identity.** We are choosing from what
  exists under acceptable licences, which is a real limit on how distinctive the
  board can look. Mitigated by owning everything *around* the cards — table, backs,
  layout, motion — and by treating the deck as swappable.
- **Winnable-only deals need a solver**, and a correct Klondike solver is a
  genuinely hard piece of software. The plan is to run it at build time rather than
  ship it — see [03 — Engine](03-engine.md).
- **"Polished" is unfalsifiable and expands forever.** The roadmap exists to make
  the shipping bar explicit.
