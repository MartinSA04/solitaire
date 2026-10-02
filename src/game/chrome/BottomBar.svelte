<script lang="ts">
  interface Props {
    canUndo: boolean;
    /** Every card face up and the stock spent: the deal is already won. docs/notes.md. */
    canFinish: boolean;
    onUndo: () => void;
    onHint: () => void;
    onFinish: () => void;
    onNewGame: () => void;
    onSettings: () => void;
  }

  const {
    canUndo,
    canFinish,
    onUndo,
    onHint,
    onFinish,
    onNewGame,
    onSettings,
  }: Props = $props();
</script>

<!--
  The thumb zone on a phone, and the right of the one bar on a desktop. A new
  game is first because it is what you reach for between games; how the game
  looks is last, behind a gear, because it is what you reach for least.

  The middle slot is Hint until the board is provably won, and Finish from
  then on.
-->
<div class="bar bottom-bar">
  <button class="control has-icon" type="button" onclick={onNewGame}>
    <svg class="icon" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="4.5" y="3" width="11" height="14" rx="2" />
      <path d="M10 7.5v5M7.5 10h5" />
    </svg>
    New game
  </button>
  <button
    class="control has-icon"
    type="button"
    disabled={!canUndo}
    onclick={onUndo}
  >
    <svg class="icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7.5 4.5 4 8l3.5 3.5" />
      <path d="M4.5 8H12a4 4 0 0 1 0 8H9" />
    </svg>
    Undo
  </button>
  {#if canFinish}
    <button class="control is-primary" type="button" onclick={onFinish}>
      Finish
    </button>
  {:else}
    <button class="control has-icon" type="button" onclick={onHint}>
      <svg class="icon" viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M7.5 13.5c0-1.6-2.5-2.9-2.5-6a5 5 0 0 1 10 0c0 3.1-2.5 4.4-2.5 6"
        />
        <path d="M7.75 16.5h4.5" />
      </svg>
      Hint
    </button>
  {/if}
  <button
    class="control"
    type="button"
    aria-label="Settings"
    onclick={onSettings}
  >
    <svg class="icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 6h7M14 6h3M3 14h2M9 14h8" />
      <circle cx="12" cy="6" r="2" />
      <circle cx="7" cy="14" r="2" />
    </svg>
  </button>
</div>

<style>
  /*
   * The one moment in the game where a control asks to be pressed. Everything
   * else in the bars is the same weight as everything else, because nothing
   * else in the bars is ever the obvious next thing to do.
   */
  .control.is-primary {
    background: var(--accent);
    color: var(--accent-contrast);
  }

  /*
   * Drawn rather than typed: `↶` and `⋯` are whatever the system font makes of
   * them, and a `?` in front of Hint reads as a question rather than a button.
   * Stroked in the label's own colour, so a disabled Undo dims with its text.
   */
  .control {
    white-space: nowrap;
  }

  /* Four controls across a 360px phone: they keep their labels on one line. */
  @media (max-width: 30rem) {
    .control {
      padding: 0 10px;
    }
  }

  .control.has-icon {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .icon {
    display: block;
    width: 20px;
    height: 20px;
    margin: auto;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .has-icon .icon {
    margin: 0;
  }
</style>
