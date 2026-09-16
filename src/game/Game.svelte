<script lang="ts">
  import {
    type Game,
    type Move,
    DECK_SIZE,
    MAX_SEED,
    fromSeedUrl,
    newGame,
    rankOf,
    suitOf,
  } from "../engine/index.ts";
  import { CardLayer, type Motion } from "./CardLayer.ts";
  import { Drag, type DragHost } from "./Drag.ts";
  import { FOUNDATION_ORDER, metricsFor } from "./Layout.ts";
  import { Stopwatch } from "./clock.ts";
  import BottomBar from "./chrome/BottomBar.svelte";
  import ResultPanel from "./chrome/ResultPanel.svelte";
  import TopBar from "./chrome/TopBar.svelte";

  /**
   * The island. It owns the game, the clock and the chrome; it does not own
   * the board.
   *
   * The boundary from docs/07-architecture.md, restated because it is the one
   * rule that keeps this fast: **the card layer is not reactive.** Svelte
   * renders 52 card elements once per deal, inside the `{#key gameId}` block
   * below, and never touches them again. `CardLayer` holds the references and
   * writes `transform` and `z-index` directly. State changes here may call
   * into it; they never re-render it.
   */

  /** Frozen, and iterated without a key that depends on anything: rendered once. */
  const CARDS: readonly number[] = Object.freeze(
    Array.from({ length: DECK_SIZE }, (_, card) => card),
  );

  const RANKS = [
    "A",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
  ];
  const SUITS = ["♣", "♦", "♥", "♠"];

  /** The clock ticks four times a second; a second-accurate display needs no more. */
  const TICK_MS = 250;

  let boardEl: HTMLDivElement | undefined = $state();
  let layerEl: HTMLDivElement | undefined = $state();

  let gameId = $state(0);
  let moves = $state(0);
  let canUndo = $state(false);
  let won = $state(false);
  let elapsedMs = $state(0);

  // Not reactive: the engine's Game is mutated in place, and every read of it
  // is driven by an explicit sync() rather than by Svelte watching it.
  let game: Game = openingGame();
  let clock = new Stopwatch(() => performance.now());

  function randomSeed(): number {
    return Math.floor(Math.random() * (MAX_SEED + 1));
  }

  /**
   * `/?deal=24` opens that exact deal, which is the whole of sharing one —
   * the seed to deal mapping is frozen forever, so the number means the same
   * game on every device and in a year's time. A mistyped number is not an
   * error, just a fresh deal.
   *
   * Only the *reading* half ships here, because it is what makes the
   * interaction tests deterministic; the share button, the daily deal and the
   * winnable-only pool are milestone 5. There is no `location` while Astro
   * renders this on the server, and nothing about the markup depends on which
   * deal it is.
   */
  function openingGame(): Game {
    if (typeof location === "undefined") return newGame(randomSeed());
    return (
      fromSeedUrl(new URLSearchParams(location.search)) ?? newGame(randomSeed())
    );
  }

  function sync(): void {
    moves = game.movesPlayed;
    canUndo = game.canUndo;
    if (game.isWon && !won) {
      won = true;
      clock.pause();
      elapsedMs = clock.elapsed;
    }
  }

  function play(move: Move, motion: Motion): boolean {
    if (won || !game.play(move)) return false;
    clock.start();
    render(motion);
    sync();
    return true;
  }

  function undo(): void {
    if (!game.undo()) return;
    render("undo");
    sync();
  }

  function newDeal(): void {
    game = newGame(randomSeed());
    clock.reset();
    elapsedMs = 0;
    won = false;
    // A new deal is the one time the 52 elements are rebuilt. The effect below
    // re-attaches the card layer to the new ones.
    gameId += 1;
    sync();
  }

  let layer: CardLayer | null = null;

  function render(motion: Motion): void {
    layer?.render(game.state, motion);
  }

  /**
   * Attach to the card elements. Re-runs whenever `{#key gameId}` rebuilds
   * them, which is the only time they change.
   */
  $effect(() => {
    const board = boardEl;
    const node = layerEl;
    if (board === undefined || node === undefined) return;

    const cards = new CardLayer(node);
    layer = cards;

    const host: DragHost = {
      state: () => game.state,
      metrics: () => cards.metrics,
      play,
      illegal: (card) => {
        if (card !== null) cards.shake(card);
      },
    };
    const drag = new Drag(board, cards, host);

    // Geometry is computed once per resize and never during a move.
    const relayout = (): void => {
      cards.setMetrics(
        metricsFor({ width: board.clientWidth, height: board.clientHeight }),
        board,
      );
      cards.render(game.state, "instant");
    };
    const observer = new ResizeObserver(relayout);
    observer.observe(board);

    return () => {
      observer.disconnect();
      drag.destroy();
      cards.destroy();
      if (layer === cards) layer = null;
    };
  });

  /** The displayed clock. Pauses with the tab, per docs/02-game-spec.md. */
  $effect(() => {
    const tick = setInterval(() => {
      if (clock.running) elapsedMs = clock.elapsed;
    }, TICK_MS);

    const onVisibilityChange = (): void => {
      if (document.hidden) clock.pause();
      else if (!won) clock.resume();
      elapsedMs = clock.elapsed;
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  });
</script>

<div class="game">
  <h1 class="sr-only">Solitaire</h1>
  <TopBar {elapsedMs} {moves} />

  <!--
    The empty slots are ordinary CSS grid, so they are server-rendered and in
    place before any JS runs. They consume the measurements Layout.ts writes
    onto this element; they never work any out.

    The screen-reader model — a labelled application region, named piles, a
    live region — is milestone 6. Until it exists the board is marked
    decorative throughout, which is honest; half a label is worse than none.
  -->
  <div class="board" bind:this={boardEl}>
    <div class="row row-top" aria-hidden="true">
      <div class="slot slot-stock">
        <span class="slot-mark">↻</span>
      </div>
      <div class="slot slot-waste"></div>
      <div class="slot-spacer"></div>
      {#each FOUNDATION_ORDER as suit (suit)}
        <div class="slot slot-foundation">
          <span class="slot-mark">{SUITS[suit]}</span>
        </div>
      {/each}
    </div>

    <div class="row row-tableau" aria-hidden="true">
      {#each [0, 1, 2, 3, 4, 5, 6] as column (column)}
        <div class="slot slot-column"></div>
      {/each}
    </div>

    {#key gameId}
      <div class="card-layer" bind:this={layerEl} aria-hidden="true">
        {#each CARDS as card (card)}
          <div
            class="card is-face-down"
            data-card={card}
            data-suit={suitOf(card)}
          >
            <span class="card-face">
              <span class="card-index">
                <span>{RANKS[rankOf(card)]}</span>
                <span class="card-index-suit">{SUITS[suitOf(card)]}</span>
              </span>
              <span class="card-pip">{SUITS[suitOf(card)]}</span>
            </span>
            <span class="card-back"></span>
          </div>
        {/each}
      </div>
    {/key}
  </div>

  <BottomBar {canUndo} onUndo={undo} onNewDeal={newDeal} />

  <!--
    Outside the board on purpose: the board captures every pointer that lands
    on it, so a button inside it would never get its click.
  -->
  {#if won}
    <ResultPanel {elapsedMs} {moves} onNewDeal={newDeal} />
  {/if}
</div>
