<script lang="ts">
  import { formatClock } from "../clock.ts";

  interface Props {
    elapsedMs: number;
    moves: number;
  }

  const { elapsedMs, moves }: Props = $props();
</script>

<!--
  Information only. Every control is in the bottom bar, where a thumb can
  reach it — see docs/05-interaction-and-motion.md.
-->
<div class="bar top-bar">
  <span class="clock">{formatClock(elapsedMs)}</span>
  <span class="moves">{moves} {moves === 1 ? "move" : "moves"}</span>
</div>
