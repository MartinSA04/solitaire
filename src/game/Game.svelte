<script lang="ts">
  import {
    type DrawCount,
    type Game,
    type GameState,
    type Move,
    type Rank,
    type Suit,
    DECK_SIZE,
    RANK_COUNT,
    SUIT_COUNT,
    TABLEAU_COLUMNS,
    cardOf,
    deserialise,
    fromSeedUrl,
    newGame,
    rankOf,
    suitOf,
    topOf,
  } from "../engine/index.ts";
  import { Sound } from "./Audio.ts";
  import { CardLayer, type Motion } from "./CardLayer.ts";
  import { Drag, type DragHost } from "./Drag.ts";
  import { FOUNDATION_ORDER, metricsFor } from "./Layout.ts";
  import {
    dealOrder,
    drawnCards,
    hintCards,
    homedCard,
    predealt,
  } from "./motion.ts";
  import { PULSE_GAP_MS, WinSequence, type WinStage } from "./WinSequence.ts";
  import { Stopwatch } from "./clock.ts";
  import { type BeatenRecord, Persist, beatenRecord } from "./Persist.ts";
  import {
    EMPTY_POOL,
    Pools,
    dailySeed,
    dayKey,
    newSeed,
    previousDayKey,
  } from "./pool.ts";
  import { type SourcedDeck, sourcedDeck } from "../decks/sourced.ts";
  import { loadDeckArt } from "./DeckArt.ts";
  import { type Settings, apply, resolve } from "./settings.ts";
  import {
    type Action,
    type Command,
    type Focus,
    FIRST_FOCUS,
    PILE_ORDER,
    clampFocus,
    focusedCards,
    interpret,
  } from "./keyboard.ts";
  import { type Grab } from "./pickup.ts";
  import {
    BOARD_HELP,
    CONFIRM_NEW,
    CONFIRM_REPLAY,
    NOT_LEGAL,
    NO_MOVES,
    PUT_BACK,
    announceHint,
    announceMove,
    announcePickup,
    announceSelection,
    announceUndo,
    announceWin,
    pileLabel,
  } from "./strings.ts";
  import BottomBar from "./chrome/BottomBar.svelte";
  import ResultPanel from "./chrome/ResultPanel.svelte";
  import SettingsSheet, { CONFIRM_MOVES } from "./chrome/SettingsSheet.svelte";
  import ShortcutSheet from "./chrome/ShortcutSheet.svelte";
  import StatsSheet from "./chrome/StatsSheet.svelte";
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

  /**
   * The finishing cascade: ~40ms between cards, accelerating, per docs/02. It
   * runs straight into the win sequence without a break — the auto-complete
   * *is* the opening beat of the win, not a skip of it.
   */
  const FINISH_MS = 40;
  const FINISH_FLOOR_MS = 14;

  /** How long a hint's "there's nothing there" stays on screen. */
  const NOTICE_MS = 3600;

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
  /** Every card face up and the stock spent: Finish replaces Hint. docs/02. */
  let canFinish = $state(false);
  /** Your best time on the deal you are playing, if you have won it before. */
  let bestMs: number | null = $state(null);
  /** Which record the win just beat, for the panel's one line. */
  let record: BeatenRecord | null = $state(null);
  /** A hint with nothing to point at says so, in the only text over the board. */
  let notice = $state("");

  /**
   * The two live regions, alternating.
   *
   * One region cannot say the same thing twice: a screen reader announces a
   * *change* of text, and "Not a legal move." following "Not a legal move." is
   * not one. Two regions, written in turn, make every announcement a change in
   * whichever one is next — which is the standard way round this and the only
   * reason there are two of anything here.
   */
  let politeA = $state("");
  let politeB = $state("");
  let turn = false;
  /** Assertive, and used for exactly one sentence in the whole product. */
  let shouted = $state("");

  function announce(text: string): void {
    turn = !turn;
    if (turn) {
      politeB = "";
      politeA = text;
    } else {
      politeA = "";
      politeB = text;
    }
  }

  /**
   * Everything that outlives a tab. `Persist` is defensive to the point of
   * tedium on purpose — storage throws in private browsing and holds whatever
   * anyone last pasted into it — and with none available it is a complete
   * working object that remembers nothing, which is the whole of docs/07's
   * "the game is fully playable with storage unavailable".
   */
  const persist = new Persist();
  const stored = persist.settings();

  /**
   * The winnable pools. Fetched alongside hydration and awaited by nothing:
   * the first deal of a load can come from the URL, from the save, or from the
   * whole seed space, and the pool applies from the next one onward.
   */
  const pools = new Pools();

  /** The clock a resumed game brings with it, read during openingGame(). */
  let resumedMs = 0;

  // Not reactive: the engine's Game is mutated in place, and every read of it
  // is driven by an explicit sync() rather than by Svelte watching it.
  let game: Game = openingGame();
  let clock = new Stopwatch(() => performance.now());

  /**
   * The board as the *chrome* sees it — thirteen pile labels, not fifty-two
   * cards.
   *
   * This is reactive where `game` deliberately is not, and it does not
   * contradict docs/07: the rule is that the card layer is never re-rendered
   * by Svelte, and this re-renders no cards. It is thirteen `aria-label`
   * attributes, and they have to be right after every move because they are
   * the entire board as far as a screen reader is concerned.
   */
  let position: GameState = $state(game.state);

  /**
   * The roving focus, and what it is carrying. See keyboard.ts: thirteen
   * positions, arrow keys between them, and a hand that stays put while the
   * focus walks to wherever the card is going.
   */
  let focus: Focus = $state(FIRST_FOCUS);
  let held: Grab | null = $state(null);
  /** True while the focus ring is on a pile, which is when a selection is worth drawing. */
  let boardFocused = $state(false);
  /** The thirteen pile elements, in PILE_ORDER, so a focus change can move the real one. */
  const pileEls: (HTMLElement | undefined)[] = new Array(PILE_ORDER.length);
  /**
   * Where each kind of pile starts in PILE_ORDER. The markup below is three
   * separate pieces of grid and PILE_ORDER is one list, so these two have to
   * agree; `test/game/keyboard.test.ts` is what says they do.
   */
  const STOCK_AT = 0;
  const WASTE_AT = 1;
  const FOUNDATION_AT = 2;
  const TABLEAU_AT = FOUNDATION_AT + SUIT_COUNT;
  /** A second press of `N` or `R` inside this window is the "yes" the menu asks for. */
  let pendingCommand: "newDeal" | "replay" | null = null;

  let stats = $state(persist.stats());
  let daily = $state(persist.daily());
  let statsOpen = $state(false);
  /** The `?` overlay. The keyboard model is the one part of the product that
   * has to be told to somebody, because no part of the board suggests it. */
  let helpOpen = $state(false);
  /** Today's daily, once a pool has arrived. `null` until then. */
  let dailyToday: number | null = $state(null);
  const dailyDone = $derived(daily.lastWon === dayKey(new Date()));

  // A resumed game arrives with its clock and its moves already on it, so the
  // chrome starts from the game rather than from zero — and whatever is on the
  // table now is what a reload should bring back, including a deal nobody has
  // moved yet. Below every piece of state it touches: `sync` on a game that is
  // somehow already won writes to all of them, and storage is untrusted input.
  clock.restore(resumedMs);
  elapsedMs = resumedMs;
  bestMs = persist.record(game.seed, game.drawCount)?.bestTimeMs ?? null;
  sync();
  save();

  /**
   * The table, the deck, the back, the sound, the clock, the draw mode and
   * whether deals come out of the winnable pool.
   *
   * Read out of storage, field by validated field, and written back whenever
   * one changes. The draw mode starts from the game rather than from what was
   * stored, because `?deal=…&draw=3` has already decided it by the time this
   * runs.
   */
  let settings: Settings = $state({ ...stored, drawCount: game.drawCount });
  let settingsOpen = $state(false);

  /**
   * One audio graph for the whole product, outliving any one deal — the win
   * sequence plays through this one too. It builds nothing until the first
   * move asks it to, so a visit that never plays makes no context and no
   * noise.
   *
   * It is audible from the first move, per docs/07, and the settings sheet can
   * turn it off — through one master gain that ramps rather than clicks — and
   * a tab that was muted comes back muted.
   */
  const sound = new Sound();

  /**
   * A deal number for a new game: out of the pool when the player asked for
   * winnable-only and one has arrived, and out of the whole 2³² space
   * otherwise.
   */
  function dealNumber(drawCount: DrawCount, winnableOnly: boolean): number {
    return newSeed(winnableOnly ? pools.get(drawCount) : EMPTY_POOL);
  }

  /**
   * What is on the table when the page opens, in order of what the player most
   * obviously asked for:
   *
   * 1. `/?deal=24` — that exact deal, which is the whole of sharing one. The
   *    seed-to-deal mapping is frozen forever, so the number means the same
   *    game on every device and in a year's time. A mistyped number is not an
   *    error, just a fresh deal.
   * 2. The game that was in progress when the tab was last closed, replayed
   *    move by move through the rules. A save that does not replay cleanly is
   *    a new game rather than an error — see `deserialise`.
   * 3. A new deal.
   *
   * There is no `location` while Astro renders this on the server, and nothing
   * about the markup depends on which deal it is.
   */
  function openingGame(): Game {
    if (typeof location === "undefined") {
      return newGame(dealNumber(1, false), 1);
    }

    const shared = fromSeedUrl(new URLSearchParams(location.search));
    if (shared !== null) return shared;

    const saved = persist.savedGame();
    if (saved !== null) {
      const resumed = deserialise(saved.game);
      if (resumed !== null) {
        resumedMs = saved.elapsedMs;
        return resumed;
      }
    }

    return newGame(
      dealNumber(stored.drawCount, stored.winnableOnly),
      stored.drawCount,
    );
  }

  function sync(): void {
    moves = game.movesPlayed;
    canUndo = game.canUndo;
    canFinish = game.canAutoComplete;
    // The pile labels, and a focus the new position can still honour: a column
    // can empty and a run can be carried off under a selection that named it.
    position = game.state;
    focus = clampFocus(game.state, focus);
    if (game.isWon && !won) {
      won = true;
      // The clock stops at Stage 0, before anything has moved — see docs/06.
      clock.pause();
      elapsedMs = clock.elapsed;
      // Assertive, and *here* rather than at the end of the cascade: nobody is
      // made to sit through thirteen seconds of decoration to be told they won.
      shouted = announceWin(elapsedMs, moves);
      keep();
      celebrate();
    }
  }

  /**
   * A win, written down: the lifetime counters, this deal's record, and the
   * daily streak if this was today's daily. Read *before* it is recorded,
   * because "did this beat anything" is a question about the figures as they
   * were a moment ago.
   */
  function keep(): void {
    const seed = game.seed;
    const drawCount = game.drawCount;
    const played = game.movesPlayed;

    record = beatenRecord(
      {
        record: persist.record(seed, drawCount),
        stats: persist.stats()[drawCount],
      },
      elapsedMs,
      played,
    );
    stats = persist.countWon(drawCount, elapsedMs, played);
    bestMs = persist.saveRecord(seed, drawCount, elapsedMs, played).bestTimeMs;

    const today = new Date();
    if (seed === dailySeed(pools.get(drawCount), today)) {
      daily = persist.winDaily(dayKey(today), previousDayKey(today));
    }

    // A finished game is not a game in progress.
    persist.clearGame();
  }

  /** The move list, after every move, so a refresh loses nothing. */
  function save(): void {
    if (won) return;
    persist.saveGame({ game: game.serialise(), elapsedMs: clock.elapsed });
  }

  function play(move: Move, motion: Motion): boolean {
    if (won) return false;
    const before = game.state;
    if (!game.play(move)) return false;
    clock.start();
    layer?.clearHint();

    // A deal counts as played the moment a move is made on it. Dealing and
    // walking away is not a game, and counting it would make the win rate a
    // measure of how often the tab was opened.
    if (game.movesPlayed === 1) stats = persist.countPlayed(game.drawCount);

    // This runs inside the pointer or click handler that asked for the move,
    // which is the user gesture the autoplay policy wants. A card going home
    // gets the ping instead of the slide — it is the one arrival worth a note,
    // and two sounds at once would only be mud.
    sound.start();
    const home = homedCard(before, move);
    if (home !== null) sound.home(rankOf(home));
    else sound.move();

    // Two moves have a motion of their own, and neither of them is something
    // the gesture that asked for it can know: the cards a draw turns over fan
    // out one after another, and a recycle sweeps the waste back as a block.
    switch (move.kind) {
      case "draw":
        render("draw", drawnCards(before, game.state));
        break;
      case "recycle":
        render("recycle");
        break;
      default:
        render(motion);
    }

    sync();
    save();
    // The finishing cascade plays thirty moves in a second; narrating them
    // would be a wall of speech ending in the one sentence that matters, which
    // `sync` has already queued as the win.
    if (!finishing) announce(announceMove(before, game.state, move));
    return true;
  }

  function undo(): void {
    const undone = game.undo();
    if (undone === null) return;
    layer?.clearHint();
    render("undo");
    sync();
    save();
    announce(announceUndo(game.state, undone));
  }

  function newDeal(): void {
    redeal(settings.drawCount);
  }

  /**
   * Today's deal, the same one everybody else gets today. Unavailable until a
   * pool has arrived, because a deal nobody else is playing is not the daily —
   * the button in the menu is disabled until then rather than dealing
   * something else and calling it the daily.
   */
  function startDaily(): void {
    const seed = dailyToday;
    if (seed === null) return;
    game = newGame(seed, settings.drawCount);
    reset();
  }

  /**
   * One move worth making, pulsing on the board — or, when there genuinely is
   * none, a sentence saying so. Not a loss screen: with unlimited undo and
   * unlimited redeals the player decides when a deal is over, and docs/02 is
   * specific that there is no such thing as losing.
   */
  function hint(): void {
    if (won) return;
    const move = game.hint();
    if (move === null) {
      say(NO_MOVES);
      return;
    }
    layer?.hint(hintCards(game.state, move));
    // Spelled out as well as pulsed: a hint that is only a glow on the board
    // is a hint half the people it exists for cannot use.
    announce(announceHint(game.state, move));
  }

  /**
   * Every remaining card home, ~40ms apart and accelerating, straight into the
   * win sequence. Offered only when the board proves it cannot get stuck —
   * see `canAutoComplete`.
   */
  function finish(): void {
    if (finishing || won) return;
    const sequence = game.autoCompleteSequence();
    if (sequence.length === 0) return;

    finishing = true;
    let at = 0;
    const step = (): void => {
      const move = sequence[at++];
      if (move === undefined || !play(move, "move")) {
        finishing = false;
        return;
      }
      if (at >= sequence.length) {
        finishing = false;
        return;
      }
      finishTimer = setTimeout(step, Math.max(FINISH_FLOOR_MS, FINISH_MS - at));
    };
    step();
  }

  // ----------------------------------------------------------- the keyboard
  //
  // docs/08-accessibility.md's model, wired up. `keyboard.ts` decides what a
  // key *meant*; everything below is what happens next, and the split is what
  // lets a test play a whole game through the model with no browser in it.

  /**
   * Keys that belong to the board rather than to the page. They are handled
   * only while the focus is on the board or nowhere at all — `Space` on the
   * Undo button has to press Undo, and an arrow key while a sheet is open is
   * the sheet's.
   */
  const BOARD_KEYS = new Set([
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    " ",
    "Enter",
    "Escape",
  ]);

  function chorded(event: KeyboardEvent): boolean {
    return event.ctrlKey || event.metaKey || event.altKey;
  }

  function boardHasFocus(): boolean {
    const active = document.activeElement;
    return (
      active === null ||
      active === document.body ||
      boardEl?.contains(active) === true
    );
  }

  function onKeyDown(event: KeyboardEvent): void {
    // A modal sheet owns every key while it is open, including Escape, which
    // is how it closes.
    if (settingsOpen || statsOpen || helpOpen) return;
    if (event.defaultPrevented) return;

    // Stages 1 to 3 are one gesture with one meaning, and the keyboard's
    // version of a tap anywhere is any key at all. Skipping a celebration has
    // to be at least as easy as starting one — but a celebration is still not
    // a reason to swallow Tab or somebody's Cmd+W.
    if (celebrating) {
      if (event.key === "Tab" || chorded(event)) return;
      event.preventDefault();
      skip();
      return;
    }

    const board = BOARD_KEYS.has(event.key);
    if (board && (won || !boardHasFocus())) return;

    const action = interpret(event, game.state, focus, held);
    if (action === null) return;
    event.preventDefault();
    perform(action);
  }

  function perform(action: Action): void {
    // Any key that does something is an answer of "no" to a question asked by
    // the last one, except the second press that answers it "yes".
    if (action.kind !== "command") pendingCommand = null;

    switch (action.kind) {
      case "focus":
        // Moving the real focus is the announcement: the pile's label is its
        // accessible name, so a screen reader reads the whole pile on arrival
        // and the live region stays quiet.
        focus = action.focus;
        pileEls[action.focus.at]?.focus();
        showSelection();
        break;

      case "select":
        focus = action.focus;
        showSelection();
        announce(announceSelection(focusedCards(game.state, focus)));
        break;

      case "pick":
        held = action.held;
        showSelection();
        announce(announcePickup(action.held.cards));
        break;

      case "release":
        held = null;
        showSelection();
        announce(PUT_BACK);
        break;

      case "play":
        // `play` announces the move itself, and is the one thing that can
        // still refuse it — the engine has the last word on every move.
        if (play(action.move, "move")) held = null;
        else announce(NOT_LEGAL);
        showSelection();
        break;

      case "refuse":
        if (action.card !== null) layer?.shake(action.card);
        announce(NOT_LEGAL);
        break;

      case "command":
        command(action.name);
        break;
    }
  }

  /**
   * The selection, drawn. Only while the focus ring is actually on the board —
   * a player who has never touched the keyboard should not find a highlight
   * sitting on the stock — and always while something is in hand, because a
   * card you are carrying has to be visible wherever the focus has gone.
   */
  /**
   * A pile taking focus, however it got it — an arrow key, a Tab into the
   * board, or a screen reader moving its cursor. Arriving somewhere new takes
   * the top card; arriving where we already were leaves a reach that a `↑` put
   * there, which is what stops `perform` undoing its own selection when it moves
   * the real focus.
   */
  function onPileFocus(at: number): void {
    boardFocused = true;
    if (focus.at !== at) focus = clampFocus(game.state, { at, reach: 1 });
    showSelection();
  }

  /** Leaving the board altogether; moving between its piles is not leaving. */
  function onBoardFocusOut(event: FocusEvent): void {
    if (boardEl?.contains(event.relatedTarget as Node | null) === true) return;
    boardFocused = false;
    showSelection();
  }

  /**
   * A pile activated by something other than a pointer — which in practice
   * means a screen reader’s activate gesture. It is deliberately the same
   * thing the space bar does: on a phone with VoiceOver there are no arrow
   * keys, and this is the whole of how the board is played there. Swipe to a
   * pile, double-tap to pick up, swipe, double-tap to put down.
   *
   * `detail` is what tells that gesture from a real one, and the distinction
   * has to be exact: every press on the board is *already* being handled by
   * `Drag` a layer above, so a click that got through here would play the
   * tapped move twice. A click synthesised by an assistive technology carries
   * a detail of zero; a click that came from a finger or a mouse carries the
   * click count. A screen reader that taps by coordinate instead lands on the
   * board and gets tap-to-auto-move, which is the right answer for it too.
   */
  function activatePile(event: MouseEvent, at: number): void {
    if (event.detail !== 0) return;
    if (won || celebrating) return;
    if (focus.at !== at) focus = clampFocus(game.state, { at, reach: 1 });
    const action = interpret({ key: " " }, game.state, focus, held);
    if (action !== null) perform(action);
  }

  function showSelection(): void {
    if (held !== null) {
      layer?.select(held.cards, true);
      return;
    }
    layer?.select(boardFocused ? focusedCards(game.state, focus) : []);
  }

  /**
   * The keys that are not about the board. `N` and `R` throw a game away, so
   * past the same number of moves the menu asks at, they ask too — as a second
   * press rather than a dialog, which is the keyboard's way of saying it.
   */
  function command(name: Command): void {
    const asking = pendingCommand;
    pendingCommand = null;

    switch (name) {
      case "undo":
        undo();
        break;
      case "hint":
        hint();
        break;
      case "finish":
        if (canFinish) finish();
        break;
      case "help":
        helpOpen = true;
        break;
      case "newDeal":
        if (asking === "newDeal" || won || moves < CONFIRM_MOVES) newDeal();
        else {
          pendingCommand = "newDeal";
          say(CONFIRM_NEW);
        }
        break;
      case "replay":
        if (asking === "replay" || won || moves < CONFIRM_MOVES) replay();
        else {
          pendingCommand = "replay";
          say(CONFIRM_REPLAY);
        }
        break;
    }
  }

  function say(text: string): void {
    notice = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      notice = "";
      // A question that has left the screen is no longer being asked, so the
      // next N is a fresh one rather than the answer to a forgotten prompt.
      pendingCommand = null;
    }, NOTICE_MS);
  }

  /**
   * A deal in a named draw mode. Changing the mode starts a new game rather
   * than reinterpreting this one, because draw-1 and draw-3 make genuinely
   * different games out of the same seed — see docs/02-game-spec.md. It takes
   * the count rather than reading it so it cannot race the settings update
   * that asked for it.
   */
  function redeal(drawCount: DrawCount): void {
    game = newGame(dealNumber(drawCount, settings.winnableOnly), drawCount);
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
    clearTimeout(finishTimer);
    finishing = false;
    layer?.clearHint();
    notice = "";
    record = null;
    // A new deal is a new board: nothing is in hand, and the focus goes back
    // to the stock, which is where a game starts.
    held = null;
    focus = FIRST_FOCUS;
    pendingCommand = null;
    // Race yourself: the time to beat on this deal, if you have beaten it.
    bestMs = persist.record(game.seed, game.drawCount)?.bestTimeMs ?? null;
    // Every card back on the stock, ready to be dealt out of it again.
    staged = predealt(game.state);
    winStage = "none";
    dismissed = false;
    clock.reset();
    elapsedMs = 0;
    won = false;
    // A new deal is the one time the 52 elements are rebuilt. The effect below
    // re-attaches the card layer to the new ones.
    gameId += 1;
    sync();
    save();
  }

  let layer: CardLayer | null = null;
  let sequence: WinSequence | null = null;
  /** The finishing cascade, and the notice's own lifetime. */
  let finishing = false;
  let finishTimer: ReturnType<typeof setTimeout> | undefined;
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  /** The pending first-frame callback, cancelled if the deal is torn down. */
  let dealFrame = 0;
  /** The debug trigger fires once a page load, not once a deal. */
  let debugged = false;

  /**
   * What the card layer is showing, when that is not simply the game: the
   * undealt board until the deal runs, and the won one under `?win`. Not
   * reactive, for the same reason `game` is not — every read of it is driven
   * by an explicit render.
   */
  let staged: GameState | null = predealt(game.state);

  function displayed(): GameState {
    return staged ?? game.state;
  }

  function render(motion: Motion, order?: readonly number[]): void {
    layer?.render(displayed(), motion, order);
  }

  /**
   * The deal: twenty-eight cards leaving the stock a row at a time, in the
   * order they were dealt into the columns.
   *
   * `staged` is already the undealt board, so the cards are genuinely sitting
   * on the stock — there is nothing to fake and nothing to measure. Two frames
   * rather than one, because a transition runs from the last style the browser
   * *painted*: one frame only gets the cards as far as being computed on the
   * stock, and they would fly from wherever they happened to be before that.
   */
  function dealOut(): number {
    return requestAnimationFrame(() => {
      dealFrame = requestAnimationFrame(() => {
        staged = null;
        render("deal", dealOrder(game.state));
      });
    });
  }

  function reducedMotion(): boolean {
    return (
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches
    );
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
      reducedMotion: reducedMotion(),
      sound,
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

    const cards = new CardLayer(node, reducedMotion());
    layer = cards;

    const host: DragHost = {
      state: () => game.state,
      metrics: () => cards.metrics,
      play,
      illegal: (card) => {
        if (card !== null) cards.shake(card);
      },
      peek: (column) => cards.peek(column, displayed()),
    };
    const drag = new Drag(board, cards, host);

    // Geometry is computed once per resize and never during a move. The first
    // one is taken here rather than waited for, so that the undealt board is on
    // screen in the frame the island mounts in.
    const relayout = (): void => {
      cards.setMetrics(
        metricsFor({ width: board.clientWidth, height: board.clientHeight }),
        board,
      );
      cards.render(displayed(), "instant");
    };
    relayout();
    showSelection();
    const observer = new ResizeObserver(relayout);
    observer.observe(board);

    // These elements are new — a deal is the one time they are rebuilt — so a
    // sourced deck has to be pointed at again. The sprite is already in the
    // document by now, so this is 52 attribute writes and no network.
    void applyArt(chosenArt());

    if (flags.debug && !debugged) {
      debugged = true;
      dealFrame = requestAnimationFrame(() => {
        staged = wonBoard();
        render("instant");
        celebrate();
      });
    } else {
      dealFrame = dealOut();
    }

    return () => {
      cancelAnimationFrame(dealFrame);
      observer.disconnect();
      drag.destroy();
      cards.destroy();
      sequence?.destroy();
      sequence = null;
      if (layer === cards) layer = null;
    };
  });

  /**
   * One keydown listener for the whole product, on the document rather than on
   * the board: `Z` has to undo while the focus is still on the Undo button, and
   * `H` has to hint from wherever you are. Which keys are the board’s and which
   * are the page’s is `onKeyDown`’s to sort out.
   */
  $effect(() => {
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  /** The audio graph outlives every deal, but not the island. */
  $effect(() => {
    return () => sound.close();
  });

  /** Nothing else in the island outlives it either. */
  $effect(() => {
    return () => {
      clearTimeout(finishTimer);
      clearTimeout(noticeTimer);
    };
  });

  /**
   * The pool for the mode being played, fetched in parallel with hydration and
   * awaited by nothing. Today's daily falls out of it when it lands; until
   * then the menu's Daily button is disabled, because a deal nobody else is
   * playing would not be the daily.
   */
  $effect(() => {
    const drawCount = settings.drawCount;
    void pools.load(drawCount).then((pool) => {
      if (settings.drawCount !== drawCount) return;
      dailyToday = dailySeed(pool, new Date());
    });
  });

  /** Every choice, remembered. A write that fails is not worth a word. */
  $effect(() => {
    persist.saveSettings(settings);
  });

  /**
   * A chosen look is three attributes on `<html>` and nothing else — see
   * settings.ts. It goes on the document element rather than on the island so
   * that the pages around the game (credits, how-to-play) are the same table
   * as the game is.
   */
  $effect(() => {
    apply(settings, document.documentElement);
  });

  /** One master gain for the whole product, and it ramps rather than clicks. */
  $effect(() => {
    sound.muted = !settings.sound;
  });

  /**
   * A deck of drawn art, fetched the first time it is asked for.
   *
   * The card layer is not reactive, so this does not re-render anything: it
   * points 52 `<use>` elements at a sprite. The fetch is the only thing in the
   * product that waits on the network after load, and nothing waits on *it* —
   * the typographic deck stays on screen until the art is there to cross-fade
   * to, and stays for good if the fetch fails.
   */
  function chosenArt(): SourcedDeck | null {
    return sourcedDeck(resolve(settings).deck) ?? null;
  }

  async function applyArt(deck: SourcedDeck | null): Promise<void> {
    if (deck === null) {
      layer?.setArt(null);
      return;
    }
    if (!(await loadDeckArt(deck))) return;
    // The sprite may have taken long enough for the player to change their
    // mind, or for a new deal to have replaced the elements.
    if (chosenArt()?.id === deck.id) layer?.setArt(deck);
  }

  $effect(() => {
    void applyArt(chosenArt());
  });

  /** The displayed clock. Pauses with the tab, per docs/02-game-spec.md. */
  $effect(() => {
    const tick = setInterval(() => {
      if (clock.running) elapsedMs = clock.elapsed;
    }, TICK_MS);

    /**
     * A move writes the save; this writes the *clock*, which otherwise only
     * moves between moves. Hiding the tab and closing it are the two moments a
     * game is likely to be left, and they are the two worth a write — four a
     * second for a number nobody is reading would not be.
     */
    const onVisibilityChange = (): void => {
      if (document.hidden) {
        clock.pause();
        save();
      } else if (!won) clock.resume();
      elapsedMs = clock.elapsed;
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    addEventListener("pagehide", save);

    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      removeEventListener("pagehide", save);
    };
  });
</script>

<!--
  A landmark, because everything on this page is inside it: the bars, the
  board, the live regions. The game *is* the page, which is exactly the case
  the rule about landmarks exists for — content outside one is content a screen
  reader has no way to jump to.
-->
<main class="game" data-win={winStage}>
  <h1 class="sr-only">Solitaire</h1>
  <TopBar {elapsedMs} {moves} showClock={settings.timer} {bestMs} />

  <!--
    The empty slots are ordinary CSS grid, so they are server-rendered and in
    place before any JS runs. They consume the measurements Layout.ts writes
    onto this element; they never work any out.

    They are also the whole of the screen-reader model. Each one is a focusable
    button whose accessible name is a complete description of the pile under
    it, and moving the roving focus between them is what makes a screen reader
    read the board — there is no second model to keep in step with this one.
    The fifty-two cards stay decorative: a pile says everything about itself.

    `inert` while the cascade runs, because for those thirteen seconds the labels
    would be describing a board the cards have left. docs/08 asks for the
    cascade to be hidden; `inert` hides it *and* takes the focus out of it, which
    `aria-hidden` on its own would only lie about.
  -->
  <div
    class="board"
    role="application"
    aria-roledescription="Klondike solitaire board"
    aria-describedby="board-help"
    inert={celebrating}
    bind:this={boardEl}
    onfocusout={onBoardFocusOut}
  >
    <!-- Stage 1's light sweep and Stage 3's radial wipe. Both are pure CSS,
         driven by `data-win` above; see src/styles/win.css. -->
    <div class="win-sweep" aria-hidden="true"></div>
    <div class="win-wipe" aria-hidden="true"></div>

    <div class="row row-top">
      <button
        class="slot slot-stock"
        type="button"
        tabindex={focus.at === STOCK_AT ? 0 : -1}
        aria-label={pileLabel(position, PILE_ORDER[STOCK_AT])}
        bind:this={pileEls[STOCK_AT]}
        onfocus={() => onPileFocus(STOCK_AT)}
        onclick={(event) => activatePile(event, STOCK_AT)}
      >
        <span class="slot-mark" aria-hidden="true">↻</span>
      </button>
      <button
        class="slot slot-waste"
        type="button"
        tabindex={focus.at === WASTE_AT ? 0 : -1}
        aria-label={pileLabel(position, PILE_ORDER[WASTE_AT])}
        bind:this={pileEls[WASTE_AT]}
        onfocus={() => onPileFocus(WASTE_AT)}
        onclick={(event) => activatePile(event, WASTE_AT)}
      ></button>
      <div class="slot-spacer" aria-hidden="true"></div>
      <!-- The foundations pulse ♠ ♥ ♦ ♣ in turn at Stage 1, and the stagger
           is the same interval WinSequence gives the cards on top of them. -->
      {#each FOUNDATION_ORDER as suit, index (suit)}
        <button
          class="slot slot-foundation"
          type="button"
          style="--pulse-delay: {index * PULSE_GAP_MS}ms"
          tabindex={focus.at === FOUNDATION_AT + index ? 0 : -1}
          aria-label={pileLabel(position, PILE_ORDER[FOUNDATION_AT + index])}
          bind:this={pileEls[FOUNDATION_AT + index]}
          onfocus={() => onPileFocus(FOUNDATION_AT + index)}
          onclick={(event) => activatePile(event, FOUNDATION_AT + index)}
        >
          <span class="slot-mark" aria-hidden="true">{SUITS[suit]}</span>
        </button>
      {/each}
    </div>

    <div class="row row-tableau">
      {#each [0, 1, 2, 3, 4, 5, 6] as column (column)}
        <button
          class="slot slot-column"
          type="button"
          tabindex={focus.at === TABLEAU_AT + column ? 0 : -1}
          aria-label={pileLabel(position, PILE_ORDER[TABLEAU_AT + column])}
          bind:this={pileEls[TABLEAU_AT + column]}
          onfocus={() => onPileFocus(TABLEAU_AT + column)}
          onclick={(event) => activatePile(event, TABLEAU_AT + column)}
        ></button>
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
            <!-- The face and the back turn together: see .card-flip in board.css. -->
            <span class="card-flip">
              <span class="card-face">
                <!--
                  Empty until somebody picks a deck we did not draw, and
                  pointed at that deck's sprite by CardLayer.setArt rather than
                  by anything reactive. `preserveAspectRatio="none"` takes the
                  three per cent between a 169 × 244.6 card and a poker card
                  out of the height instead of cropping the border off.
                -->
                <svg
                  class="card-art"
                  viewBox="0 0 100 140"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <use />
                </svg>
                <span class="card-index">
                  <span>{RANKS[rankOf(card)]}</span>
                  <span class="card-index-suit">{SUITS[suitOf(card)]}</span>
                </span>
                <span class="card-pip">{SUITS[suitOf(card)]}</span>
              </span>
              <span class="card-back"></span>
            </span>
          </div>
        {/each}
      </div>
    {/key}
  </div>

  <BottomBar
    {canUndo}
    {canFinish}
    onUndo={undo}
    onHint={hint}
    onFinish={finish}
    onMenu={() => (settingsOpen = true)}
  />

  <!--
    The only text the game puts over the board, and only ever a fact about the
    position: what a hint says when there is nothing to point at. It announces
    itself politely and then leaves on its own.
  -->
  {#if notice !== ""}
    <p class="notice" role="status">{notice}</p>
  {/if}

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
      {record}
      seed={game.seed}
      drawCount={game.drawCount}
      onReplay={replay}
      onNewDeal={newDeal}
      onDismiss={() => (dismissed = true)}
    />
  {/if}

  <!--
    The deals you can start, the statistics, and every theme, deck and back —
    all available on first load. Mounted only while it is open, because a
    <dialog> that is in the document but closed is still a dozen controls in
    the accessibility tree.
  -->
  {#if settingsOpen}
    <SettingsSheet
      {settings}
      movesAtRisk={won ? 0 : moves}
      dailySeed={dailyToday}
      {dailyDone}
      onChange={(next) => (settings = next)}
      onNewDeal={newDeal}
      onDaily={startDaily}
      onReplay={replay}
      onStats={() => (statsOpen = true)}
      onRedeal={redeal}
      onClose={() => (settingsOpen = false)}
    />
  {/if}

  <!--
    Lifetime counters and the streak, one tap on from the menu. Mounted only
    while it is open, for the same reason the menu is.
  -->
  {#if statsOpen}
    <StatsSheet {stats} {daily} onClose={() => (statsOpen = false)} />
  {/if}

  <!-- What `?` opens, and the only place the key model is written down. -->
  {#if helpOpen}
    <ShortcutSheet onClose={() => (helpOpen = false)} />
  {/if}

  <!--
    The live regions, and the board’s description. All four are outside the
    board on purpose: the board goes `inert` for the length of the cascade, and a
    live region inside it would be silenced at exactly the moment it has the
    most important thing in the game to say.
  -->
  <p class="sr-only" aria-live="polite" aria-atomic="true">{politeA}</p>
  <p class="sr-only" aria-live="polite" aria-atomic="true">{politeB}</p>
  <p class="sr-only" aria-live="assertive" aria-atomic="true">{shouted}</p>
  <p id="board-help" class="sr-only">{BOARD_HELP}</p>
</main>
