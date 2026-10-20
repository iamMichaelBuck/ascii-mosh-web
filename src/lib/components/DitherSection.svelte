<script lang="ts">
  import {
    defaultDither, DITHER_ALGORITHMS, DITHER_COLOR_MODES, DITHER_PALETTES, isErrorDiffusion, paletteColors, toHex,
    type DitherSettings,
  } from '../model/settings';
  import ColorRow from './ColorRow.svelte';
  import EffectSection, { type StageReorder } from './EffectSection.svelte';
  import Picker from './Picker.svelte';
  import ValueSlider from './ValueSlider.svelte';

  let { settings = $bindable(), reorder }: { settings: DitherSettings; reorder: StageReorder } = $props();
  const D = defaultDither();
  const diffusion = $derived(isErrorDiffusion(settings.algorithm));
</script>

<EffectSection title="Dither" icon="grid" bind:enabled={settings.isEnabled} {reorder}>
  <Picker label="Algorithm" bind:value={settings.algorithm} items={DITHER_ALGORITHMS} />
  <Picker label="Colors" bind:value={settings.colorMode} items={DITHER_COLOR_MODES} />

  {#if settings.colorMode === 'mono'}
    <div class="colors">
      <ColorRow label="Dark" bind:color={settings.dark} />
      <ColorRow label="Light" bind:color={settings.light} />
    </div>
    <ValueSlider label="Threshold" bind:value={settings.threshold} min={0} max={1} def={D.threshold} />
  {:else if settings.colorMode === 'palette'}
    <Picker label="Palette" bind:value={settings.palette} items={DITHER_PALETTES} />
    <div class="swatches">
      {#each paletteColors(settings.palette) as c, i (i)}
        <span style:background={toHex(c)}></span>
      {/each}
    </div>
  {:else if settings.colorMode === 'rgbLevels'}
    <ValueSlider label="Levels per channel" bind:value={settings.levels} min={2} max={8} step={1} digits={0} def={D.levels} />
  {:else}
    <ValueSlider label="Colors" bind:value={settings.autoColors} min={2} max={32} step={1} digits={0} def={D.autoColors} />
  {/if}

  <ValueSlider label="Pixel size" bind:value={settings.pixelScale} min={1} max={16} step={1} digits={0} def={D.pixelScale} />
  <ValueSlider label={diffusion ? 'Error strength' : 'Pattern strength'} bind:value={settings.strength} min={0} max={1.5} def={D.strength} />
  {#if diffusion}
    <label class="check-row"><input class="check" type="checkbox" bind:checked={settings.serpentine} /> Serpentine scan</label>
  {/if}
</EffectSection>

<style>
  .colors {
    display: flex;
    gap: 12px;
  }
  .swatches {
    display: flex;
    gap: 2px;
    height: 12px;
    border-radius: 3px;
    overflow: hidden;
  }
  .swatches span {
    flex: 1;
  }
</style>
