<script lang="ts">
  import {
    type Game,
    type GameState,
    type Move,
    type Rank,
    type Suit,
    DECK_SIZE,
    MAX_SEED,
    RANK_COUNT,
    SUIT_COUNT,
    TABLEAU_COLUMNS,
    cardOf,
    fromSeedUrl,
    newGame,
    rankOf,
    suitOf,
    topOf,
  } from "../engine/index.ts";
  import { CardLayer, type Motion } from "./CardLayer.ts";
  import { Drag, type DragHost } from "./Drag.ts";
  import { FOUNDATION_ORDER, metricsFor } from "./Layout.ts";
  import { PULSE_GAP_MS, WinSequence, type WinStage } from "./WinSequence.ts";
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
  let canvasEl: HTMLCanvasElement | undefined = $state();

  let gameId = $state(0);
  let moves = $state(0);
  let canUndo = $state(false);
  let won = $state(false);
  let elapsedMs = $state(0);
  let winStage: WinStage = $state("none");
  let dismissed = $state(false);

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
      // The clock stops at Stage 0, before anything has moved — see docs/06.
      clock.pause();
      elapsedMs = clock.elapsed;
      celebrate();
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
    reset();
  }

  /** The same deal again — race yourself. */
  function replay(): void {
    game.restart();
    reset();
  }

  function reset(): void {
    sequence?.destroy();
    sequence = null;
    staged = null;
    winStage = "none";
    dismissed = false;
    clock.reset();
    elapsedMs = 0;
    won = false;
    // A new deal is the one time the 52 elements are rebuilt. The effect below
    // re-attaches the card layer to the new ones.
    gameId += 1;
    sync();
  }

  let layer: CardLayer | null = null;
  let sequence: WinSequence | null = null;
  /** The debug trigger fires once a page load, not once a deal. */
  let debugged = false;

  /**
   * What the card layer is showing. The same thing as the game, except under
   * the debug trigger — see {@link wonBoard}.
   */
  let staged: GameState | null = null;

  function displayed(): GameState {
    return staged ?? game.state;
  }

  function render(motion: Motion): void {
    layer?.render(displayed(), motion);
  }

  /**
   * Two query flags, and between them everything docs/07 asks for to make the
   * win sequence testable at all:
   *
   * - `?win` runs the whole thing on load without one having been won, which
   *   is how it gets looked at without playing a game first.
   * - `?winseed=N` seeds the physics and fixes the timestep, so two runs of
   *   the same seed produce the same cascade and the visual and performance
   *   suites compare like with like.
   *
   * Neither touches the deal. There is no `location` while Astro renders this
   * on the server.
   */
  function winFlags(): { debug: boolean; seed: number | null } {
    if (typeof location === "undefined") return { debug: false, seed: null };
    const params = new URLSearchParams(location.search);
    const seed = params.get("winseed");
    return {
      debug: params.has("win"),
      seed: seed !== null && /^\d{1,10}$/.test(seed) ? Number(seed) : null,
    };
  }

  const flags = winFlags();

  /** Stages 1 to 3: the part that is skippable, and the part that needs a veil. */
  const celebrating = $derived(winStage !== "none" && winStage !== "card");

  /**
   * Stage 0 begins here. If there is no board to run it on — no geometry yet,
   * or the island never mounted — the panel is shown directly rather than
   * inventing a celebration, because winning must always be acknowledged.
   */
  function celebrate(): void {
    const cards = layer;
    const canvas = canvasEl;
    const board = boardEl;
    if (cards === null || canvas === undefined || board === undefined) {
      winStage = "card";
      return;
    }

    sequence?.destroy();
    sequence = new WinSequence({
      layer: cards,
      canvas,
      board,
      seed: flags.seed,
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      // The sound setting is milestone 5's, along with the storage it lives
      // in. Until then the win sequence is audible, per docs/07.
      muted: false,
      foundationTops: () =>
        FOUNDATION_ORDER.map(
          (suit) => topOf(displayed().foundations[suit] ?? []) ?? null,
        ),
      onStage: (stage) => {
        winStage = stage;
      },
    });
    sequence.start();
  }

  /** A tap anywhere during stages 1–3. A celebration you can't escape is a punishment. */
  function skip(): void {
    sequence?.skip();
  }

  /**
   * Every card home — the position the sequence was designed against.
   *
   * `?win` runs on whatever deal happens to be on screen, and fifty-two
   * face-down cards falling off a board that was never won is not the thing
   * being looked at. This stages the won board on the card layer only; the
   * game underneath is the real one and is untouched, which is why the engine
   * is not involved in producing it.
   */
  function wonBoard(): GameState {
    return {
      stock: [],
      waste: [],
      foundations: Array.from({ length: SUIT_COUNT }, (_, suit) =>
        Array.from({ length: RANK_COUNT }, (_, rank) =>
          cardOf(suit as Suit, rank as Rank),
        ),
      ),
      tableau: Array.from({ length: TABLEAU_COLUMNS }, () => ({
        cards: [],
        down: 0,
      })),
      drawCount: game.drawCount,
      seed: game.seed,
      moves: game.state.moves,
    };
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
      cards.render(displayed(), "instant");
    };
    const observer = new ResizeObserver(relayout);
    observer.observe(board);

    if (flags.debug && !debugged) {
      debugged = true;
      // One frame, so the ResizeObserver above has handed over the geometry.
      requestAnimationFrame(() => {
        staged = wonBoard();
        render("instant");
        celebrate();
      });
    }

    return () => {
      observer.disconnect();
      drag.destroy();
      cards.destroy();
      sequence?.destroy();
      sequence = null;
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

<div class="game" data-win={winStage}>
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
    <!-- Stage 1's light sweep and Stage 3's radial wipe. Both are pure CSS,
         driven by `data-win` above; see src/styles/win.css. -->
    <div class="win-sweep" aria-hidden="true"></div>
    <div class="win-wipe" aria-hidden="true"></div>

    <div class="row row-top" aria-hidden="true">
      <div class="slot slot-stock">
        <span class="slot-mark">↻</span>
      </div>
      <div class="slot slot-waste"></div>
      <div class="slot-spacer"></div>
      <!-- The foundations pulse ♠ ♥ ♦ ♣ in turn at Stage 1, and the stagger
           is the same interval WinSequence gives the cards on top of them. -->
      {#each FOUNDATION_ORDER as suit, index (suit)}
        <div
          class="slot slot-foundation"
          style="--pulse-delay: {index * PULSE_GAP_MS}ms"
        >
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
    The trail canvas. Beneath the cards, over everything else, and sized to the
    whole screen rather than to the board — the cascade's floor is the bottom
    of the *screen*, since the chrome has faded out by the time anything is
    falling. It exists from first paint so that nothing is created at win time.
  -->
  <canvas class="trail-layer" bind:this={canvasEl} aria-hidden="true"></canvas>

  <!--
    One tap, at any moment, jumps to the end card. The veil is what makes
    "anywhere" true: the board captures every pointer that lands on it, so a
    tap on the table would otherwise be swallowed by the drag handler. The
    labelled control is the Skip button; the veil is decorative.
  -->
  {#if celebrating}
    <div class="win-veil" aria-hidden="true" onpointerdown={skip}></div>
  {/if}
  {#if winStage === "cascade"}
    <button class="control win-skip" type="button" onclick={skip}>Skip</button>
  {/if}

  <!--
    Outside the board on purpose: the board captures every pointer that lands
    on it, so a button inside it would never get its click.
  -->
  {#if winStage === "card" && !dismissed}
    <ResultPanel
      {elapsedMs}
      {moves}
      seed={game.seed}
      drawCount={game.drawCount}
      onReplay={replay}
      onNewDeal={newDeal}
      onDismiss={() => (dismissed = true)}
    />
  {/if}
</div>
