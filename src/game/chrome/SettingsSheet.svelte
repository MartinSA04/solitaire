<script lang="ts">
  import type { DrawCount } from "../../engine/index.ts";
  import { AUTO, type Settings } from "../settings.ts";

  interface Props {
    settings: Settings;
    /** A game is under way, so changing the draw mode has something to lose. */
    inProgress: boolean;
    onChange: (settings: Settings) => void;
    /** Confirmed draw-mode change: a new deal, per docs/02-game-spec.md. */
    onRedeal: (drawCount: DrawCount) => void;
    onClose: () => void;
  }

  const { settings, inProgress, onChange, onRedeal, onClose }: Props = $props();

  /**
   * The settings sheet: every theme, deck and back available on first load,
   * with nothing to unlock and nothing to buy. docs/04-art-direction.md is
   * emphatic about that and it is the easiest promise in the product to keep,
   * since a deck here is a set of custom properties rather than a purchase.
   *
   * Choices are radio groups on purpose. They are what these are, they come
   * with arrow-key navigation and a group label for free, and a row of
   * div-buttons with `aria-pressed` would be an imitation of them that reads
   * worse in every screen reader.
   *
   * What is *not* here: winnable-only deals and the reduced-motion override,
   * which want milestone 5's storage and milestone 6's motion work
   * respectively, and nothing is persisted yet at all — a setting lasts as
   * long as the tab. That is the honest shape of milestone 4: the sheet is
   * real, the storage behind it is the next milestone's.
   */

  const THEMES = [
    { value: "warm", label: "Warm" },
    { value: "minimal", label: "Minimal" },
    { value: "dark", label: "Dark" },
  ] as const;

  const DECKS = [
    { value: AUTO, label: "Match the table" },
    { value: "minimal", label: "Minimal" },
    { value: "high-contrast", label: "High contrast" },
    { value: "four-colour", label: "Four colour" },
  ] as const;

  const BACKS = [
    { value: AUTO, label: "Match the table" },
    { value: "lattice", label: "Lattice" },
    { value: "dots", label: "Dot grid" },
    { value: "solid", label: "Solid" },
  ] as const;

  const DRAWS = [1, 3] as const;

  let sheet: HTMLDialogElement | undefined = $state();
  let closing = $state(false);
  /** The draw mode waiting on "this will start a new deal — go on, then". */
  let pending: DrawCount | null = $state(null);

  $effect(() => {
    // `showModal` rather than an `open` attribute: it is what gives the sheet
    // Escape, a backdrop, an inert page behind it and the focus ring landing
    // inside it, none of which is worth reimplementing.
    sheet?.showModal();
  });

  /**
   * Both ways out run the same animation. Escape fires `cancel`, which would
   * otherwise close the dialog in the same frame; it is turned back into an
   * ordinary close so that the sheet leaves the way it arrived.
   */
  function dismiss(): void {
    if (closing) return;
    closing = true;
  }

  function onCancel(event: Event): void {
    event.preventDefault();
    dismiss();
  }

  /** The end of the leaving animation is the end of the sheet. */
  function onAnimationEnd(): void {
    if (!closing) return;
    sheet?.close();
    onClose();
  }

  function choose(patch: Partial<Settings>): void {
    onChange({ ...settings, ...patch });
  }

  function chooseDraw(drawCount: DrawCount): void {
    if (drawCount === settings.drawCount) return;
    // The two modes make different games out of the same seed, so this cannot
    // be applied to the game already on the table. Nothing happens until it
    // is confirmed.
    if (inProgress) pending = drawCount;
    else {
      choose({ drawCount });
      onRedeal(drawCount);
    }
  }

  function confirmDraw(): void {
    const drawCount = pending;
    if (drawCount === null) return;
    pending = null;
    choose({ drawCount });
    onRedeal(drawCount);
    dismiss();
  }
</script>

<dialog
  class="sheet"
  class:is-closing={closing}
  aria-label="Settings"
  bind:this={sheet}
  oncancel={onCancel}
  onanimationend={onAnimationEnd}
>
  <div class="sheet-body">
    <div class="sheet-head">
      <h2 class="sheet-title">Settings</h2>
      <button class="control" type="button" onclick={dismiss}>Done</button>
    </div>

    <fieldset class="group">
      <legend class="group-label">Table</legend>
      <div class="choices">
        {#each THEMES as option (option.value)}
          <label class="choice">
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={settings.theme === option.value}
              onchange={() => choose({ theme: option.value })}
            />
            <span class="choice-label">{option.label}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    <fieldset class="group">
      <legend class="group-label">Cards</legend>
      <div class="choices">
        {#each DECKS as option (option.value)}
          <label class="choice">
            <input
              type="radio"
              name="deck"
              value={option.value}
              checked={settings.deck === option.value}
              onchange={() => choose({ deck: option.value })}
            />
            <span class="choice-label">{option.label}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    <fieldset class="group">
      <legend class="group-label">Card back</legend>
      <div class="choices">
        {#each BACKS as option (option.value)}
          <label class="choice">
            <input
              type="radio"
              name="back"
              value={option.value}
              checked={settings.back === option.value}
              onchange={() => choose({ back: option.value })}
            />
            <span class="choice-label">{option.label}</span>
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
            <span class="choice-label"
              >{count} card{count === 1 ? "" : "s"}</span
            >
          </label>
        {/each}
      </div>
      {#if pending !== null}
        <p class="confirm">
          <span class="confirm-text">
            Draw {pending} makes a different game out of the same deal, so this starts
            a new one.
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
              onclick={confirmDraw}
            >
              New deal
            </button>
          </span>
        </p>
      {/if}
    </fieldset>

    <div class="group switches">
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
  </div>
</dialog>

<style>
  /*
   * A bottom sheet on a phone, a centred dialog past 48rem — the one chrome
   * breakpoint in the product, per docs/05-interaction-and-motion.md.
   */
  .sheet {
    position: fixed;
    margin: 0 auto;
    inset: auto 0 0 0;
    width: min(460px, 100%);
    max-height: 86dvh;
    padding: 0;
    border: 0;
    border-radius: 20px 20px 0 0;
    background: var(--sheet-bg);
    color: var(--chrome-fg);
    box-shadow: 0 -18px 48px rgb(0 0 0 / 45%);
    animation: sheet-rise var(--t-settle) var(--e-out);
  }

  .sheet::backdrop {
    background: rgb(0 0 0 / 45%);
    animation: veil-in var(--t-settle) var(--e-out);
  }

  /*
   * Leaving is its own pair of keyframes rather than the arriving pair played
   * in reverse: an animation keeps its identity across a class change as long
   * as its name does, so reversing `sheet-rise` would re-point an animation
   * that has already finished, and it would jump to the end without ever
   * firing the `animationend` that closes the dialog.
   */
  .sheet.is-closing {
    animation: sheet-fall var(--t-settle) var(--e-inout) forwards;
  }

  .sheet.is-closing::backdrop {
    animation: veil-out var(--t-settle) var(--e-inout) forwards;
  }

  @keyframes sheet-rise {
    from {
      transform: translate3d(0, 100%, 0);
    }
  }

  @keyframes sheet-fall {
    to {
      transform: translate3d(0, 100%, 0);
    }
  }

  @keyframes veil-in {
    from {
      opacity: 0;
    }
  }

  @keyframes veil-out {
    to {
      opacity: 0;
    }
  }

  .sheet-body {
    display: grid;
    gap: 18px;
    padding: 16px 20px calc(20px + env(safe-area-inset-bottom, 0px));
    overflow-y: auto;
    max-height: inherit;
  }

  .sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .sheet-title {
    margin: 0;
    font-size: 19px;
    font-weight: 650;
  }

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

  .control.is-primary {
    background: var(--accent);
    color: var(--accent-contrast);
  }

  @media (min-width: 48rem) {
    .sheet {
      inset: 50% auto auto 50%;
      margin: 0;
      translate: -50% -50%;
      border-radius: 18px;
      animation: sheet-appear var(--t-settle) var(--e-out);
    }

    .sheet.is-closing {
      animation: sheet-vanish var(--t-settle) var(--e-inout) forwards;
    }

    @keyframes sheet-appear {
      from {
        opacity: 0;
        transform: scale(0.96);
      }
    }

    @keyframes sheet-vanish {
      to {
        opacity: 0;
        transform: scale(0.96);
      }
    }
  }
</style>
