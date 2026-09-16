<script module lang="ts">
  /**
   * Long enough to be a game worth keeping. docs/02-game-spec.md: a new deal
   * or a replay is one tap under about five moves and asks first over it —
   * which is a modal in direct response to something just pressed, and so the
   * one kind docs/01 allows.
   *
   * Exported because the keyboard asks the same question with a second press
   * of the same key — see Game.svelte. One number, two ways of putting it.
   */
  export const CONFIRM_MOVES = 5;
</script>

<script lang="ts">
  import type { DrawCount } from "../../engine/index.ts";
  import {
    AUTO,
    BACKS,
    DECKS,
    THEMES,
    type Back,
    type Deck,
    type Settings,
    type Theme,
  } from "../settings.ts";
  import Sheet from "./Sheet.svelte";

  interface Props {
    settings: Settings;
    /**
     * Moves made on the deal currently on the table, and zero once it is won:
     * what starting another game would throw away. Everything in here that
     * ends a game asks first in proportion to this.
     */
    movesAtRisk: number;
    /** Today's daily, once the pool has arrived. `null` before that. */
    dailySeed: number | null;
    /** Today's daily is already won, so the button says so rather than nagging. */
    dailyDone: boolean;
    onChange: (settings: Settings) => void;
    onNewDeal: () => void;
    onDaily: () => void;
    onReplay: () => void;
    onStats: () => void;
    /** Confirmed draw-mode change: a new deal, per docs/02-game-spec.md. */
    onRedeal: (drawCount: DrawCount) => void;
    onClose: () => void;
  }

  const {
    settings,
    movesAtRisk,
    dailySeed,
    dailyDone,
    onChange,
    onNewDeal,
    onDaily,
    onReplay,
    onStats,
    onRedeal,
    onClose,
  }: Props = $props();

  /**
   * Everything the bottom bar's three buttons don't have room for: the deals
   * you can start, the statistics, and every theme, deck and back — available
   * on first load, with nothing to unlock and nothing to buy.
   * docs/04-art-direction.md is emphatic about that and it is the easiest
   * promise in the product to keep, since a deck here is a set of custom
   * properties rather than a purchase.
   *
   * Choices are radio groups on purpose. They are what these are, they come
   * with arrow-key navigation and a group label for free, and a row of
   * div-buttons with `aria-pressed` would be an imitation of them that reads
   * worse in every screen reader.
   *
   * The reduced-motion override docs/07 lists in the settings schema is not
   * here: the motion work it belongs to is milestone 6, and a switch that
   * overrides a preference the product has not finished honouring would be a
   * promise rather than a setting.
   */

  const THEME_LABELS: Record<Theme, string> = {
    warm: "Warm",
    minimal: "Minimal",
    dark: "Dark",
  };

  const DECK_LABELS: Record<Deck, string> = {
    minimal: "Minimal",
    "high-contrast": "High contrast",
    "four-colour": "Four colour",
    // The one deck that is a download. It is last because it is the one that
    // costs something, and it says so on /credits rather than in a warning.
    french: "French",
  };

  const BACK_LABELS: Record<Back, string> = {
    lattice: "Lattice",
    dots: "Dot grid",
    solid: "Solid",
  };

  const DRAWS = [1, 3] as const;

  /** What a press is waiting on "yes, end this game" for. */
  type Pending =
    | { kind: "draw"; drawCount: DrawCount }
    | { kind: "new" }
    | { kind: "daily" }
    | { kind: "replay" };

  let pending: Pending | null = $state(null);
  let sheet: ReturnType<typeof Sheet> | undefined = $state();

  const CONFIRM: Record<Pending["kind"], { text: string; go: string }> = {
    draw: {
      text: "makes a different game out of the same deal, so this starts a new one.",
      go: "New deal",
    },
    new: { text: "A new deal ends the game on the table.", go: "New deal" },
    daily: {
      text: "Today's deal ends the game on the table.",
      go: "Daily deal",
    },
    replay: {
      text: "Replaying deals this same game again from the start.",
      go: "Replay",
    },
  };

  function choose(patch: Partial<Settings>): void {
    onChange({ ...settings, ...patch });
  }

  function chooseDraw(drawCount: DrawCount): void {
    if (drawCount === settings.drawCount) return;
    // The two modes make different games out of the same seed, so this cannot
    // be applied to the game already on the table — at *any* number of moves,
    // because the alternative is silently replacing the board underneath
    // somebody who was only reading the setting.
    if (movesAtRisk > 0) pending = { kind: "draw", drawCount };
    else {
      choose({ drawCount });
      onRedeal(drawCount);
    }
  }

  /** A deal the sheet starts is a deal the player wants to see. */
  function start(kind: "new" | "daily" | "replay"): void {
    if (movesAtRisk >= CONFIRM_MOVES) {
      pending = { kind };
      return;
    }
    run({ kind });
  }

  function run(what: Pending): void {
    pending = null;
    if (what.kind === "draw") {
      choose({ drawCount: what.drawCount });
      onRedeal(what.drawCount);
    } else if (what.kind === "new") onNewDeal();
    else if (what.kind === "daily") onDaily();
    else onReplay();
    sheet?.dismiss();
  }
</script>

<Sheet title="Menu" {onClose} bind:this={sheet}>
  <!--
    The actions the bottom bar gave up its middle slot for. Starting a game is
    one tap from here and the sheet gets out of the way afterwards.
  -->
  <div class="group actions">
    <button class="control action" type="button" onclick={() => start("new")}>
      New deal
    </button>
    <button
      class="control action"
      type="button"
      disabled={dailySeed === null}
      onclick={() => start("daily")}
    >
      Daily deal{dailyDone ? " ✓" : ""}
    </button>
    <button
      class="control action"
      type="button"
      onclick={() => start("replay")}
    >
      Replay this deal
    </button>
  </div>

  {#if pending !== null && pending.kind !== "draw"}
    <p class="confirm">
      <span class="confirm-text">
        {movesAtRisk} moves in. {CONFIRM[pending.kind].text}
      </span>
      <span class="confirm-actions">
        <button class="control" type="button" onclick={() => (pending = null)}>
          Cancel
        </button>
        <button
          class="control is-primary"
          type="button"
          onclick={() => pending !== null && run(pending)}
        >
          {CONFIRM[pending.kind].go}
        </button>
      </span>
    </p>
  {/if}

  <fieldset class="group">
    <legend class="group-label">Table</legend>
    <div class="choices">
      {#each THEMES as value (value)}
        <label class="choice">
          <input
            type="radio"
            name="theme"
            {value}
            checked={settings.theme === value}
            onchange={() => choose({ theme: value })}
          />
          <span class="choice-label">{THEME_LABELS[value]}</span>
        </label>
      {/each}
    </div>
  </fieldset>

  <fieldset class="group">
    <legend class="group-label">Cards</legend>
    <div class="choices">
      <label class="choice">
        <input
          type="radio"
          name="deck"
          value={AUTO}
          checked={settings.deck === AUTO}
          onchange={() => choose({ deck: AUTO })}
        />
        <span class="choice-label">Match the table</span>
      </label>
      {#each DECKS as value (value)}
        <label class="choice">
          <input
            type="radio"
            name="deck"
            {value}
            checked={settings.deck === value}
            onchange={() => choose({ deck: value })}
          />
          <span class="choice-label">{DECK_LABELS[value]}</span>
        </label>
      {/each}
    </div>
  </fieldset>

  <fieldset class="group">
    <legend class="group-label">Card back</legend>
    <div class="choices">
      <label class="choice">
        <input
          type="radio"
          name="back"
          value={AUTO}
          checked={settings.back === AUTO}
          onchange={() => choose({ back: AUTO })}
        />
        <span class="choice-label">Match the table</span>
      </label>
      {#each BACKS as value (value)}
        <label class="choice">
          <input
            type="radio"
            name="back"
            {value}
            checked={settings.back === value}
            onchange={() => choose({ back: value })}
          />
          <span class="choice-label">{BACK_LABELS[value]}</span>
        </label>
      {/each}
    </div>
  </fieldset>

  <fieldset class="group">
    <legend class="group-label">Draw</legend>
    <div class="choices">
      {#each DRAWS as count (count)}
        <label class="choice">
          <input
            type="radio"
            name="draw"
            value={count}
            checked={settings.drawCount === count}
            onchange={() => chooseDraw(count)}
          />
          <span class="choice-label">{count} card{count === 1 ? "" : "s"}</span>
        </label>
      {/each}
    </div>
    {#if pending !== null && pending.kind === "draw"}
      <p class="confirm">
        <span class="confirm-text">
          Draw {pending.drawCount}
          {CONFIRM.draw.text}
        </span>
        <span class="confirm-actions">
          <button
            class="control"
            type="button"
            onclick={() => (pending = null)}
          >
            Cancel
          </button>
          <button
            class="control is-primary"
            type="button"
            onclick={() => pending !== null && run(pending)}
          >
            {CONFIRM.draw.go}
          </button>
        </span>
      </p>
    {/if}
  </fieldset>

  <div class="group switches">
    <label class="switch">
      <input
        type="checkbox"
        checked={settings.winnableOnly}
        onchange={(event) =>
          choose({ winnableOnly: event.currentTarget.checked })}
      />
      <span class="track" aria-hidden="true"></span>
      <span class="choice-label">Winnable deals only</span>
    </label>
    <label class="switch">
      <input
        type="checkbox"
        checked={settings.sound}
        onchange={(event) => choose({ sound: event.currentTarget.checked })}
      />
      <span class="track" aria-hidden="true"></span>
      <span class="choice-label">Sound</span>
    </label>
    <label class="switch">
      <input
        type="checkbox"
        checked={settings.timer}
        onchange={(event) => choose({ timer: event.currentTarget.checked })}
      />
      <span class="track" aria-hidden="true"></span>
      <span class="choice-label">Show the clock</span>
    </label>
  </div>

  <!--
    Two taps from the game, which is what docs/04 asks of the credits: every
    deck's source and licence, including the ones whose licence asks for
    nothing. How to play is here for the same reason — the rules have to be
    somewhere a player can find them without leaving the site to look.
  -->
  <p class="sheet-foot">
    <button
      class="link"
      type="button"
      onclick={() => {
        onStats();
        sheet?.dismiss();
      }}
    >
      Statistics
    </button>
    <a href="/how-to-play/">How to play</a>
    <a href="/credits/">Credits and licences</a>
  </p>
</Sheet>

<style>
  .group {
    margin: 0;
    padding: 0;
    border: 0;
  }

  .group-label {
    padding: 0;
    margin-bottom: 8px;
    font-size: 13px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--chrome-fg-dim);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .action {
    flex: 1 1 auto;
    white-space: nowrap;
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--chrome-fg) 14%, transparent);
  }

  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  /*
   * The input is the control and it stays the control: it is what carries the
   * checked state, the label and the keyboard model. It is only moved out of
   * the way visually, and the ring comes back on the chip around it.
   */
  .choice input,
  .switch input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  /*
   * Every surface in here is mixed out of `--chrome-fg`, never a hard-coded
   * white at six per cent: this sheet is shown on the Minimal table too, where
   * the ink is dark and a white wash is invisible.
   */
  .choice {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 14px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--chrome-fg) 8%, transparent);
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--chrome-fg) 14%, transparent);
    cursor: pointer;
  }

  /* Lightness and a border, never hue alone — docs/08-accessibility.md. */
  .choice:has(input:checked) {
    background: var(--accent);
    color: var(--accent-contrast);
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .choice:has(input:focus-visible),
  .switch:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .switches {
    display: grid;
    gap: 8px;
  }

  .switch {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 44px;
    cursor: pointer;
  }

  /*
   * A switch that still says what it is with the colour taken away: the knob
   * travels as well as the track filling. Lightness and position, never hue
   * alone — the same rule as the legal-drop highlight, from docs/08.
   */
  .track {
    position: relative;
    flex: 0 0 auto;
    width: 44px;
    height: 26px;
    border-radius: 13px;
    background: color-mix(in srgb, var(--chrome-fg) 12%, transparent);
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--chrome-fg) 20%, transparent);
  }

  .track::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--chrome-fg-dim);
    transition: translate var(--t-instant) var(--e-out);
  }

  .switch:has(input:checked) .track {
    background: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .switch:has(input:checked) .track::after {
    background: var(--accent-contrast);
    translate: 18px 0;
  }

  .confirm {
    display: grid;
    gap: 10px;
    margin: 12px 0 0;
    padding: 12px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--chrome-fg) 8%, transparent);
    font-size: 14px;
  }

  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .confirm-text {
    color: var(--chrome-fg-dim);
  }

  .sheet-foot {
    display: flex;
    flex-wrap: wrap;
    /* Three links at fourteen pixels do not always fit a 360px phone in a row. */
    gap: 4px 20px;
    margin: 0;
    font-size: 14px;
  }

  .sheet-foot a,
  .sheet-foot .link {
    display: inline-block;
    min-height: 44px;
    line-height: 44px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--chrome-fg-dim);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }

  .control.is-primary {
    background: var(--accent);
    color: var(--accent-contrast);
  }
</style>
