<script lang="ts">
  import { formatClock } from "../clock.ts";

  interface Props {
    elapsedMs: number;
    moves: number;
    /** The clock is hideable, for people who find one stressful. docs/02. */
    showClock: boolean;
    /** Your best time on this deal, if you have beaten it before. */
    bestMs: number | null;
  }

  const { elapsedMs, moves, showClock, bestMs }: Props = $props();
</script>

<!--
  Information only. Every control is in the bottom bar, where a thumb can
  reach it — see docs/05-interaction-and-motion.md.

  A hidden clock is hidden, not stopped: the time is still recorded, which is
  what makes it safe to hide. The slot stays so the move counter does not walk
  across the bar when it goes.

  The best line is the whole of "replay this deal and race yourself" from
  docs/02: a deal you have won before opens with the time to beat next to the
  clock. It goes with the clock rather than the moves because it is the number
  people actually race, and it is hidden with the clock for the same reason
  the clock can be hidden at all.
-->
<div class="bar top-bar">
  <span class="clock">
    {showClock ? formatClock(elapsedMs) : ""}
    {#if showClock && bestMs !== null}
      <span class="best">best {formatClock(bestMs)}</span>
    {/if}
  </span>
  <span class="moves">{moves} {moves === 1 ? "move" : "moves"}</span>
</div>

<style>
  .best {
    margin-left: 8px;
    color: var(--chrome-fg-dim);
    font-size: 13px;
    font-weight: 400;
  }
</style>
