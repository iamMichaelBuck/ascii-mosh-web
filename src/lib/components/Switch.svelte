<script lang="ts">
  let { checked = $bindable(), label, small = false }: { checked: boolean; label: string; small?: boolean } = $props();
</script>

<button
  type="button"
  role="switch"
  class="switch"
  class:small
  aria-checked={checked}
  aria-label={label}
  title={label}
  onclick={() => (checked = !checked)}
>
  <span class="knob"></span>
</button>

<style>
  .switch {
    --w: 32px;
    --h: 18px;
    flex: none;
    position: relative;
    width: var(--w);
    height: var(--h);
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: var(--fill-quaternary);
    box-shadow: inset 0 0 0 0.5px var(--border-strong);
    cursor: pointer;
    transition: background 0.18s;
  }
  .switch.small {
    --w: 26px;
    --h: 15px;
  }
  .switch[aria-checked='true'] {
    background: var(--accent);
  }
  .knob {
    position: absolute;
    top: 1.5px;
    left: 1.5px;
    width: calc(var(--h) - 3px);
    height: calc(var(--h) - 3px);
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    transition: transform 0.18s cubic-bezier(0.3, 0.7, 0.4, 1.1);
  }
  .switch[aria-checked='true'] .knob {
    transform: translateX(calc(var(--w) - var(--h)));
  }
</style>
