<script lang="ts">
  /**
   * Slider whose handle resets to `def` on double-click. Dragging the handle moves it relative
   * to where it was grabbed; clicking the track jumps there. Arrow keys step, Delete resets.
   */
  let {
    label,
    value = $bindable(),
    min,
    max,
    step,
    def,
    digits = 2,
    suffix = '',
  }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    def?: number;
    digits?: number;
    suffix?: string;
  } = $props();

  const HANDLE = 14;
  const fmt = (v: number) => v.toFixed(digits) + suffix;

  let track = $state<HTMLDivElement>();
  let drag = $state<{ startValue: number; startX: number; onHandle: boolean; moved: boolean } | null>(null);
  let lastHandleClick = 0;
  let animate = $state(false);

  const span = $derived(max - min);
  const t = $derived(span > 0 ? (Math.min(Math.max(value, min), max) - min) / span : 0);
  const defT = $derived(def !== undefined && span > 0 ? (def - min) / span : null);
  const isDefault = $derived(def === undefined || Math.abs(value - def) < 1e-9);

  function setValue(raw: number) {
    let v = Math.min(Math.max(raw, min), max);
    if (step && step > 0) v = min + Math.round((v - min) / step) * step;
    v = Number(v.toFixed(10));
    if (v !== value) value = v;
  }

  const trackWidth = () => Math.max(1, (track?.clientWidth ?? 1) - HANDLE);
  const setFraction = (f: number) => setValue(min + Math.min(Math.max(f, 0), 1) * span);

  function onpointerdown(e: PointerEvent) {
    if (e.button !== 0) return;
    const rect = track!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const handleX = HANDLE / 2 + trackWidth() * t;
    const onHandle = Math.abs(x - handleX) <= HANDLE * 0.75;
    if (!onHandle) setFraction((x - HANDLE / 2) / trackWidth());
    drag = { startValue: value, startX: e.clientX, onHandle, moved: false };
    track!.setPointerCapture(e.pointerId);
    track!.focus();
    e.preventDefault();
  }

  function onpointermove(e: PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    if (Math.abs(dx) >= 3) drag.moved = true;
    if (drag.onHandle) {
      setValue(drag.startValue + (dx / trackWidth()) * span);
    } else {
      const rect = track!.getBoundingClientRect();
      setFraction((e.clientX - rect.left - HANDLE / 2) / trackWidth());
    }
  }

  function onpointerup() {
    if (!drag) return;
    const { onHandle, moved } = drag;
    drag = null;
    if (!onHandle || moved) return;
    // A click without movement on the handle: check for a double-click.
    const now = performance.now();
    if (now - lastHandleClick < 450 && def !== undefined) {
      reset();
      lastHandleClick = 0;
    } else {
      lastHandleClick = now;
    }
  }

  function reset() {
    if (def === undefined) return;
    animate = true;
    value = def;
    setTimeout(() => (animate = false), 200);
  }

  function onkeydown(e: KeyboardEvent) {
    const inc = step ?? span / 100;
    const big = e.shiftKey ? 10 : 1;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowUp': setValue(value + inc * big); break;
      case 'ArrowLeft': case 'ArrowDown': setValue(value - inc * big); break;
      case 'PageUp': setValue(value + inc * 10); break;
      case 'PageDown': setValue(value - inc * 10); break;
      case 'Home': setValue(min); break;
      case 'End': setValue(max); break;
      case 'Delete': case 'Backspace': reset(); break;
      default: return;
    }
    e.preventDefault();
  }
</script>

<div class="value-slider">
  <div class="head">
    <span class="caption">{label}</span>
    <span class="value" class:changed={!isDefault}>{fmt(value)}</span>
  </div>
  <div
    bind:this={track}
    class="track"
    class:animate
    class:dragging={drag?.onHandle}
    role="slider"
    tabindex="0"
    aria-label={label}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    aria-valuetext={fmt(value)}
    title={def !== undefined ? `Double-click the handle to reset to ${fmt(def)}` : undefined}
    style:--t={t}
    style:--handle="{HANDLE}px"
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={() => (drag = null)}
    {onkeydown}
  >
    <div class="rail"></div>
    <div class="fill"></div>
    {#if defT !== null && defT > 0.001 && defT < 0.999}
      <div class="tick" style:--d={defT}></div>
    {/if}
    <div class="knob"></div>
  </div>
</div>

<style>
  .value-slider {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }
  .value {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--text-2);
  }
  .value.changed {
    color: var(--accent);
  }
  .track {
    position: relative;
    height: 18px;
    touch-action: none;
    cursor: default;
    border-radius: calc(4px * var(--round));
    --w: calc(100% - var(--handle));
  }
  .rail,
  .fill {
    position: absolute;
    top: 7px;
    height: 4px;
    border-radius: calc(2px * var(--round));
    left: calc(var(--handle) / 2);
  }
  .rail {
    right: calc(var(--handle) / 2);
    background: var(--fill-quaternary);
  }
  .fill {
    width: calc(var(--w) * var(--t));
    background: var(--accent);
  }
  .tick {
    position: absolute;
    top: 5px;
    width: 2px;
    height: 8px;
    border-radius: calc(1px * var(--round));
    left: calc(var(--handle) / 2 + var(--w) * var(--d) - 1px);
    background: var(--text-2);
    opacity: 0.6;
  }
  .knob {
    position: absolute;
    top: 2px;
    width: var(--handle);
    height: var(--handle);
    border-radius: calc(50% * var(--round));
    left: calc(var(--w) * var(--t));
    background: var(--knob);
    box-shadow: var(--knob-shadow);
    transition: transform 0.12s;
  }
  .dragging .knob {
    transform: scale(1.12);
  }
  .animate .knob,
  .animate .fill {
    transition: left 0.2s cubic-bezier(0.3, 0.7, 0.4, 1), width 0.2s cubic-bezier(0.3, 0.7, 0.4, 1);
  }
</style>
