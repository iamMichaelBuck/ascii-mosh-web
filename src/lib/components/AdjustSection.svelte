<script lang="ts">
  import { defaultAdjust, type AdjustSettings } from '../model/settings';
  import EffectSection from './EffectSection.svelte';
  import ValueSlider from './ValueSlider.svelte';

  let { settings = $bindable() }: { settings: AdjustSettings } = $props();
  const D = defaultAdjust();

  /** Shows where each colour of the spectrum ends up after the hue shift. */
  const hueStrip = $derived(
    `linear-gradient(to right, ${Array.from({ length: 13 }, (_, i) => `hsl(${(i * 30 + settings.hue + 360) % 360} 80% 55%)`).join(', ')})`,
  );
</script>

<EffectSection title="Adjust" icon="sliders" bind:enabled={settings.isEnabled}>
  <ValueSlider label="Brightness" bind:value={settings.brightness} min={-1} max={1} def={D.brightness} />
  <ValueSlider label="Contrast" bind:value={settings.contrast} min={0} max={3} def={D.contrast} />
  <ValueSlider label="Gamma" bind:value={settings.gamma} min={0.2} max={3} def={D.gamma} />
  <ValueSlider label="Saturation" bind:value={settings.saturation} min={0} max={2} def={D.saturation} />
  <ValueSlider label="Hue shift" bind:value={settings.hue} min={-180} max={180} step={1} digits={0} suffix="°" def={D.hue} />
  <div class="hue-strip" style:background={hueStrip} aria-hidden="true"></div>
  <div class="row">
    <label class="check-row"><input class="check" type="checkbox" bind:checked={settings.invert} /> Invert</label>
    <button type="button" class="btn small" onclick={() => (settings = { ...defaultAdjust(), isEnabled: settings.isEnabled })}>
      Reset
    </button>
  </div>
</EffectSection>

<style>
  .hue-strip {
    height: 6px;
    margin: 0 7px;
    border-radius: calc(3px * var(--round));
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
</style>
