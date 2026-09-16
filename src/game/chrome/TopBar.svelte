<script lang="ts">
  import { formatClock } from "../clock.ts";

  interface Props {
    elapsedMs: number;
    moves: number;
    /** The clock is hideable, for people who find one stressful. docs/02. */
    showClock: boolean;
  }

  const { elapsedMs, moves, showClock }: Props = $props();
</script>

<!--
  Information only. Every control is in the bottom bar, where a thumb can
  reach it — see docs/05-interaction-and-motion.md.

  A hidden clock is hidden, not stopped: the time is still recorded, which is
  what makes it safe to hide. The slot stays so the move counter does not walk
  across the bar when it goes.
-->
<div class="bar top-bar">
  <span class="clock">{showClock ? formatClock(elapsedMs) : ""}</span>
  <span class="moves">{moves} {moves === 1 ? "move" : "moves"}</span>
</div>
