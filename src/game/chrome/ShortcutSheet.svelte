<script lang="ts">
  import Sheet from "./Sheet.svelte";
  import { SHORTCUTS } from "../strings.ts";

  interface Props {
    onClose: () => void;
  }

  const { onClose }: Props = $props();
</script>

<!--
  What `?` opens. A keyboard model nobody can find is a keyboard model nobody
  has, and docs/01-product-brief.md's secondary player is specifically
  "someone on a desktop who will discover the keyboard shortcuts" — this is
  where they discover them.

  The table is the one in docs/08-accessibility.md, read out of strings.ts so
  that the keys the overlay promises and the keys `keyboard.ts` honours are
  one list. `test/game/keyboard.test.ts` is what holds them together.
-->
<Sheet title="Keyboard shortcuts" {onClose}>
  <dl class="keys">
    {#each SHORTCUTS as { keys, what } (what)}
      <div class="key-row">
        <dt>
          {#each keys as key (key)}
            <kbd>{key}</kbd>
          {/each}
        </dt>
        <dd>{what}</dd>
      </div>
    {/each}
  </dl>
</Sheet>

<style>
  .keys {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .key-row {
    display: grid;
    grid-template-columns: 7.5rem 1fr;
    gap: 12px;
    align-items: baseline;
    padding: 7px 0;
  }

  dt {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  dd {
    margin: 0;
    font-size: 15px;
  }

  /*
   * A key looks like a key. It is the one place in the product that draws a
   * physical object, and it earns it: a row of them scans as "press this"
   * without a word of explanation.
   */
  kbd {
    font: inherit;
    font-size: 13px;
    line-height: 1;
    padding: 5px 7px;
    border-radius: 6px;
    background: var(--chrome-bg);
    box-shadow: inset 0 0 0 1px var(--slot-stroke);
    white-space: nowrap;
  }
</style>
