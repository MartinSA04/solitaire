<script lang="ts">
  import type { AllStats, Daily } from "../Persist.ts";
  import { formatClock } from "../clock.ts";
  import Sheet from "./Sheet.svelte";

  interface Props {
    stats: AllStats;
    daily: Daily;
    onClose: () => void;
  }

  const { stats, daily, onClose }: Props = $props();

  /**
   * The numbers, and nothing else. docs/02-game-spec.md is exact about what is
   * not here: no losses column, no "you abandoned 14 games", no percentage
   * dressed up as a grade. Games played and games won are both facts; the
   * difference between them is not a number anybody needs looking at.
   *
   * The streak is here too, and this is the only place it appears. It is never
   * used to nag — no badge, no reminder, no "don't lose your streak". It is a
   * number on a screen you had to open.
   */

  const MODES = [1, 3] as const;

  function rate(won: number, played: number): string {
    return played === 0 ? "—" : `${Math.round((100 * won) / played)}%`;
  }

  function time(ms: number | null): string {
    return ms === null ? "—" : formatClock(ms);
  }

  function count(value: number | null): string {
    return value === null ? "—" : String(value);
  }

  const rows = $derived([
    { label: "Played", values: MODES.map((m) => String(stats[m].played)) },
    { label: "Won", values: MODES.map((m) => String(stats[m].won)) },
    {
      label: "Win rate",
      values: MODES.map((m) => rate(stats[m].won, stats[m].played)),
    },
    { label: "Best time", values: MODES.map((m) => time(stats[m].bestTimeMs)) },
    {
      label: "Fewest moves",
      values: MODES.map((m) => count(stats[m].fewestMoves)),
    },
  ]);

  const days = (n: number): string => `${n} ${n === 1 ? "day" : "days"}`;
</script>

<Sheet title="Statistics" {onClose}>
  <table class="figures">
    <thead>
      <tr>
        <td></td>
        {#each MODES as mode (mode)}
          <th scope="col">Draw {mode}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as row (row.label)}
        <tr>
          <th scope="row">{row.label}</th>
          {#each row.values as value, index (MODES[index])}
            <td>{value}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>

  <div class="group">
    <h3 class="group-label">Daily deal</h3>
    <p class="streak">
      <span class="streak-now">{days(daily.current)}</span>
      <span class="streak-best">longest {days(daily.longest)}</span>
    </p>
  </div>

  <p class="foot">
    Kept on this device only, and never sent anywhere — there is nowhere to send
    it to.
  </p>
</Sheet>

<style>
  .figures {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  .figures th,
  .figures td {
    padding: 8px 0;
    text-align: right;
    font-weight: 400;
  }

  .figures thead th {
    font-size: 13px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--chrome-fg-dim);
  }

  .figures tbody th {
    text-align: left;
    color: var(--chrome-fg-dim);
  }

  .figures tbody tr + tr th,
  .figures tbody tr + tr td {
    border-top: 1px solid color-mix(in srgb, var(--chrome-fg) 10%, transparent);
  }

  .group-label {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 400;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--chrome-fg-dim);
  }

  .streak {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin: 0;
  }

  .streak-now {
    font-size: 22px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }

  .streak-best {
    color: var(--chrome-fg-dim);
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }

  .foot {
    margin: 0;
    color: var(--chrome-fg-dim);
    font-size: 13px;
  }
</style>
