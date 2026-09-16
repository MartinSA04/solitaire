<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    title: string;
    onClose: () => void;
    children: Snippet;
  }

  const { title, onClose, children }: Props = $props();

  /**
   * The shell every sheet wears: a bottom sheet on a phone, a centred dialog
   * past 48rem — the one chrome breakpoint in the product, per
   * docs/05-interaction-and-motion.md.
   *
   * It is a component rather than a copied block because the menu, the deck
   * gallery and the statistics are the same object as far as the player is
   * concerned, and three copies of an eighty-line dialog animation is three
   * things to keep in step.
   *
   * ## One scroller
   *
   * A `<dialog>` is `overflow: auto` in the user-agent stylesheet, so a sheet
   * with a scrolling body inside it has two nested scrollers on the same
   * gesture. Both of them overflowed here: the outer one by the inner one's
   * padding, which is what put a second scrollbar down the deck gallery and an
   * empty strip under its last row. The dialog is `overflow: hidden` and the
   * body is the only thing that scrolls.
   *
   * The head is outside the body for the same reason. It is the sheet's title
   * and its way out, and a way out that scrolls off the top of a list of
   * twenty-one decks is a way out you have to scroll back up to find.
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
   * Every way out runs the same animation. Escape fires `cancel`, which would
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

  /**
   * The backdrop is the dialog element itself — everything inside the sheet is
   * `.sheet-body` — so a press whose target is the dialog landed outside the
   * sheet. That is the gesture a phone user makes to put a sheet away, and on
   * a desktop it is what clicking off a dialog has always done.
   *
   * `mousedown` rather than `click`: a drag that starts on a select or a
   * slider inside the sheet and finishes outside it fires `click` on the
   * dialog, and closing on that loses whatever was being dragged.
   */
  function onBackdrop(event: MouseEvent): void {
    if (event.target === sheet) dismiss();
  }

  /** The end of the leaving animation is the end of the sheet. */
  function onAnimationEnd(event: AnimationEvent): void {
    // The head and the body run their own animations; only the sheet's own
    // ending means the sheet has finished leaving.
    if (!closing || event.target !== sheet) return;
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
  onmousedown={onBackdrop}
  onanimationend={onAnimationEnd}
>
  <div class="sheet-head">
    <!--
      Decoration, and hidden from the accessibility tree: it is the phone
      affordance that says "this can be pushed back down", and it says nothing
      to a screen reader that the close button does not say better.
    -->
    <span class="sheet-grabber" aria-hidden="true"></span>
    <h2 class="sheet-title">{title}</h2>
    <!--
      A close button, not "Done".

      Everything in these sheets applies the moment it is pressed — a theme
      repaints, a deck starts fetching, a new deal is already dealt. "Done"
      names a step that does not exist, and on a sheet you can also leave by
      Escape, by the backdrop or by pushing it down, it is the only one of the
      four that claims to be finishing something.
    -->
    <button class="sheet-close" type="button" onclick={dismiss}>
      <span class="sr-only">Close</span>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M7 7 17 17M17 7 7 17"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          fill="none"
        />
      </svg>
    </button>
  </div>

  <div class="sheet-body">
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

    /*
     * A fixed head over a scrolling body, and the dialog itself never scrolls
     * — see the note at the top of this file. `overflow: hidden` is what
     * overrides the user-agent `auto`.
     */
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
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
    align-content: start;
    gap: 18px;
    padding: 4px 20px calc(20px + env(safe-area-inset-bottom, 0px));
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .sheet-head {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 8px;
    padding: 12px 12px 8px 20px;
  }

  /*
   * The grabber spans both columns above the title, which is where a phone
   * puts it. It is not a control: the sheet is dismissed by the button beside
   * it, by Escape, or by pressing the table behind it.
   */
  .sheet-grabber {
    grid-column: 1 / -1;
    justify-self: center;
    width: 36px;
    height: 4px;
    margin-bottom: 6px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--chrome-fg) 26%, transparent);
  }

  .sheet-title {
    margin: 0;
    font-size: 19px;
    font-weight: 650;
  }

  .sheet-close {
    appearance: none;
    display: grid;
    place-items: center;
    /* WCAG 2.2 target size, like every other control in the chrome. */
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: color-mix(in srgb, var(--chrome-fg) 10%, transparent);
    color: var(--chrome-fg);
    cursor: pointer;
  }

  .sheet-close svg {
    width: 20px;
    height: 20px;
  }

  .sheet-close:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  @media (hover: hover) {
    .sheet-close:hover {
      background: color-mix(in srgb, var(--chrome-fg) 18%, transparent);
    }
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

    /* A dialog is not pushed anywhere, so it has nothing to be grabbed by. */
    .sheet-grabber {
      display: none;
    }

    .sheet-head {
      padding-top: 16px;
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
