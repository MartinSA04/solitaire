<script lang="ts">
  import { formatClock } from "../clock.ts";

  interface Props {
    elapsedMs: number;
    moves: number;
    seed: number;
    drawCount: number;
    onReplay: () => void;
    onNewDeal: () => void;
    onDismiss: () => void;
  }

  const {
    elapsedMs,
    moves,
    seed,
    drawCount,
    onReplay,
    onNewDeal,
    onDismiss,
  }: Props = $props();

  /**
   * Stage 4 of docs/06-win-sequence.md. The numbers count up from zero — the
   * only gratuitous flourish in the panel, and what makes them feel earned.
   *
   * Two things the mock in that doc shows are deliberately absent until
   * milestone 5, which is where the storage they read from arrives: the record
   * line ("Best time on this deal") and the share button. A record line that
   * can only ever say nothing is worse than no record line, and a share button
   * belongs with the rest of sharing.
   */
  const COUNT_MS = 600;

  let progress = $state(0);
  let panel: HTMLElement | undefined = $state();

  /** Focus follows the panel, per docs/08-accessibility.md. */
  $effect(() => {
    panel?.focus();
  });

  $effect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      progress = 1;
      return;
    }
    const from = performance.now();
    let frame = requestAnimationFrame(function tick(now: number) {
      const t = Math.min(1, (now - from) / COUNT_MS);
      // Decelerating, so the last few tenths of a second are readable rather
      // than a blur that stops dead.
      progress = 1 - Math.pow(1 - t, 3);
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  });

  const shownTime = $derived(formatClock(elapsedMs * progress));
  const shownMoves = $derived(Math.round(moves * progress));

  /** "4 811 209" — grouped with thin spaces, so a deal number can be read aloud. */
  const dealNumber = $derived(
    String(seed).replace(/\B(?=(\d{3})+(?!\d))/g, " "),
  );

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") onDismiss();
  }
</script>

<svelte:window onkeydown={onKeyDown} />

<!--
  Behind it, the empty table with a fresh deal already available: the sequence
  never blocks the next game, and "new deal" is one tap from here.

  Not `aria-modal`, because nothing traps focus yet — the full screen-reader
  and keyboard model is milestone 6, and claiming a modality that isn't
  implemented is worse than not claiming it.
-->
<div
  class="result-backdrop"
  onpointerdown={onDismiss}
  aria-hidden="true"
  role="presentation"
></div>

<div
  class="result"
  role="dialog"
  aria-label="You won"
  tabindex="-1"
  bind:this={panel}
>
  <p class="result-title">You won</p>

  <dl class="result-figures">
    <div class="result-figure">
      <dt>time</dt>
      <dd class="result-number">{shownTime}</dd>
    </div>
    <div class="result-figure">
      <dt>{moves === 1 ? "move" : "moves"}</dt>
      <dd class="result-number">{shownMoves}</dd>
    </div>
  </dl>

  <p class="result-deal">
    Deal #{dealNumber} · Draw {drawCount}
  </p>

  <div class="result-actions">
    <button class="control result-action" type="button" onclick={onReplay}>
      Replay
    </button>
    <button
      class="control result-action is-primary"
      type="button"
      onclick={onNewDeal}
    >
      New deal
    </button>
  </div>
</div>

<style>
  .result-backdrop {
    position: absolute;
    inset: 0;
    z-index: 4900;
  }

  /*
   * Rises from the bottom on a phone, scales up from the centre on a desktop.
   * Only `transform` and `opacity` animate, here as everywhere.
   */
  .result {
    position: absolute;
    left: 50%;
    bottom: 0;
    z-index: 5000;
    width: min(420px, 100%);
    translate: -50% 0;
    display: grid;
    justify-items: center;
    gap: 4px;
    padding: 28px 24px calc(28px + env(safe-area-inset-bottom, 0px));
    border-radius: 20px 20px 0 0;
    background: var(--sheet-bg);
    box-shadow: 0 -18px 48px rgb(0 0 0 / 45%);
    text-align: center;
    animation: result-rise 480ms var(--e-out) both;
  }

  .result:focus {
    outline: none;
  }

  @keyframes result-rise {
    from {
      transform: translate3d(0, 100%, 0);
    }
  }

  .result-title {
    margin: 0 0 12px;
    font-size: 24px;
    font-weight: 650;
  }

  .result-figures {
    display: flex;
    gap: 40px;
    margin: 0 0 16px;
  }

  /*
   * A description list has to name a thing before it describes it, so the
   * label is first in the markup and the number is first on screen.
   */
  .result-figure {
    display: flex;
    flex-direction: column-reverse;
    gap: 2px;
  }

  .result-figures dt {
    color: var(--chrome-fg-dim);
    font-size: 14px;
  }

  .result-figures dd {
    margin: 0;
  }

  .result-number {
    font-size: 34px;
    font-weight: 650;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  .result-deal {
    margin: 0 0 16px;
    color: var(--chrome-fg-dim);
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }

  .result-actions {
    display: flex;
    gap: 12px;
    /* The panel is a centred grid, so the row has to claim the width itself
       before the two buttons can share it. */
    width: 100%;
  }

  /* Replay and New deal carry equal weight; only one of them is emphasised. */
  .result-action {
    flex: 1 1 0;
    white-space: nowrap;
    box-shadow: inset 0 0 0 1px var(--slot-stroke);
  }

  .result-action.is-primary {
    background: var(--accent);
    color: var(--accent-contrast);
    box-shadow: none;
  }

  @media (min-width: 48rem) {
    .result {
      top: 50%;
      bottom: auto;
      translate: -50% -50%;
      border-radius: 20px;
      padding-bottom: 28px;
      box-shadow: 0 18px 48px rgb(0 0 0 / 45%);
      animation-name: result-grow;
    }

    @keyframes result-grow {
      from {
        opacity: 0;
        scale: 0.94;
      }
    }
  }

  /* Cross-fades in rather than rising, and the numbers arrive at their final
     value — see the reduced-motion section of docs/06. */
  @media (prefers-reduced-motion: reduce) {
    /* A real duration, not `--t-slow`: reduced motion flattens that to 1ms,
       and a 1ms cross-fade is a cut. */
    .result {
      animation: result-fade 300ms var(--e-out) both;
    }

    @keyframes result-fade {
      from {
        opacity: 0;
      }
    }
  }
</style>
