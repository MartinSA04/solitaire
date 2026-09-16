<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    title: string;
    onClose: () => void;
    children: Snippet;
  }

  const { title, onClose, children }: Props = $props();

  /**
   * The shell both sheets wear: a bottom sheet on a phone, a centred dialog
   * past 48rem — the one chrome breakpoint in the product, per
   * docs/05-interaction-and-motion.md.
   *
   * It is a component rather than a copied block because the menu and the
   * statistics are the same object as far as the player is concerned, and two
   * copies of an eighty-line dialog animation is two things to keep in step.
   */

  let sheet: HTMLDialogElement | undefined = $state();
  let closing = $state(false);

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
   *
   * Exported, so a sheet that has just started a game can see itself out.
   */
  export function dismiss(): void {
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
</script>

<dialog
  class="sheet"
  class:is-closing={closing}
  aria-label={title}
  bind:this={sheet}
  oncancel={onCancel}
  onanimationend={onAnimationEnd}
>
  <div class="sheet-body">
    <div class="sheet-head">
      <h2 class="sheet-title">{title}</h2>
      <button class="control" type="button" onclick={dismiss}>Done</button>
    </div>

    {@render children()}
  </div>
</dialog>

<style>
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
