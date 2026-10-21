<script lang="ts">
  import { fromHex, toHex, type RGBColor } from '../model/settings';

  let { label, color = $bindable() }: { label: string; color: RGBColor } = $props();
</script>

<label class="color-row">
  <span class="caption">{label}</span>
  <input type="color" value={toHex(color)} oninput={(e) => (color = fromHex(e.currentTarget.value))} />
</label>

<style>
  .color-row {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }
  input {
    width: 34px;
    height: 20px;
    padding: 2px;
    border: 0;
    border-radius: calc(5px * var(--round));
    background: var(--control);
    box-shadow: var(--shadow);
    cursor: pointer;
  }
  input::-webkit-color-swatch-wrapper {
    padding: 0;
  }
  input::-webkit-color-swatch {
    border: 0;
    border-radius: calc(3px * var(--round));
  }
  input::-moz-color-swatch {
    border: 0;
    border-radius: calc(3px * var(--round));
  }
</style>
