<script lang="ts">
  import {
    DATABEND_MODES, defaultGlitch, DISPLACEMENT_SOURCES, SLIT_SCAN_MODES, type GlitchSettings,
  } from '../model/settings';
  import EffectSection, { type StageReorder } from './EffectSection.svelte';
  import Icon from './Icon.svelte';
  import Picker from './Picker.svelte';
  import ValueSlider from './ValueSlider.svelte';

  let { settings = $bindable(), reorder, reseed }: { settings: GlitchSettings; reorder: StageReorder; reseed: () => void } = $props();
  const D = defaultGlitch();
</script>

<EffectSection title="Glitch & Datamosh" icon="glitch" bind:enabled={settings.isEnabled} {reorder}>
  <div class="seed">
    <span class="caption secondary">Seed {settings.seed}</span>
    <button type="button" class="btn small" onclick={reseed}><Icon name="dice" size={13} /> Reseed</button>
  </div>

  <EffectSection title="Slit-scan" icon="wave" bind:enabled={settings.slitScan.isEnabled} subsection expanded={false}>
    <Picker label="Mode" bind:value={settings.slitScan.mode} items={SLIT_SCAN_MODES} />
    <label class="check-row"><input class="check" type="checkbox" bind:checked={settings.slitScan.vertical} /> Vertical</label>
    <ValueSlider label="Amount" bind:value={settings.slitScan.amount} min={0} max={1} def={D.slitScan.amount} />
    {#if settings.slitScan.mode === 'stretch'}
      <ValueSlider label="Slit position" bind:value={settings.slitScan.position} min={0} max={1} def={D.slitScan.position} />
    {:else}
      <ValueSlider label="Frequency" bind:value={settings.slitScan.frequency} min={0.5} max={20} digits={1} def={D.slitScan.frequency} />
    {/if}
  </EffectSection>

  <EffectSection title="Displacement map" icon="arrows" bind:enabled={settings.displacement.isEnabled} subsection expanded={false}>
    <Picker label="Map" bind:value={settings.displacement.source} items={DISPLACEMENT_SOURCES} />
    <ValueSlider label="Strength X" bind:value={settings.displacement.strengthX} min={-0.5} max={0.5} def={D.displacement.strengthX} />
    <ValueSlider label="Strength Y" bind:value={settings.displacement.strengthY} min={-0.5} max={0.5} def={D.displacement.strengthY} />
    {#if settings.displacement.source === 'noise'}
      <ValueSlider label="Noise scale" bind:value={settings.displacement.noiseScale} min={0.01} max={0.5} def={D.displacement.noiseScale} />
    {/if}
  </EffectSection>

  <EffectSection title="Quantization-table abuse" icon="blocks" bind:enabled={settings.quant.isEnabled} subsection expanded={false}>
    <ValueSlider label="JPEG quality" bind:value={settings.quant.quality} min={1} max={100} step={1} digits={0} def={D.quant.quality} />
    <ValueSlider label="Block scale" bind:value={settings.quant.blockScale} min={1} max={8} step={1} digits={0} suffix="×" def={D.quant.blockScale} />
    <ValueSlider label="Table scramble" bind:value={settings.quant.scramble} min={0} max={1} def={D.quant.scramble} />
    <ValueSlider label="Dequant mismatch" bind:value={settings.quant.mismatch} min={0} max={2} def={D.quant.mismatch} />
    <ValueSlider label="Coefficient corruption" bind:value={settings.quant.corruption} min={0} max={0.2} digits={3} def={D.quant.corruption} />
    <ValueSlider label="DC drift" bind:value={settings.quant.dcDrift} min={0} max={1} def={D.quant.dcDrift} />
  </EffectSection>

  <EffectSection title="Chroma subsampling" icon="drop" bind:enabled={settings.chroma.isEnabled} subsection expanded={false}>
    <ValueSlider label="Horizontal factor" bind:value={settings.chroma.horizontal} min={1} max={32} step={1} digits={0} def={D.chroma.horizontal} />
    <ValueSlider label="Vertical factor" bind:value={settings.chroma.vertical} min={1} max={32} step={1} digits={0} def={D.chroma.vertical} />
    <ValueSlider label="Chroma offset X" bind:value={settings.chroma.offsetX} min={-0.1} max={0.1} digits={3} def={D.chroma.offsetX} />
    <ValueSlider label="Chroma offset Y" bind:value={settings.chroma.offsetY} min={-0.1} max={0.1} digits={3} def={D.chroma.offsetY} />
    <ValueSlider label="Chroma boost" bind:value={settings.chroma.boost} min={0} max={3} def={D.chroma.boost} />
  </EffectSection>

  <EffectSection title="Macroblock displacement" icon="dashed" bind:enabled={settings.macroblock.isEnabled} subsection expanded={false}>
    <ValueSlider label="Block size" bind:value={settings.macroblock.blockSize} min={4} max={64} step={1} digits={0} suffix=" px" def={D.macroblock.blockSize} />
    <ValueSlider label="Probability" bind:value={settings.macroblock.probability} min={0} max={1} def={D.macroblock.probability} />
    <ValueSlider label="Motion X" bind:value={settings.macroblock.motionX} min={-0.2} max={0.2} digits={3} def={D.macroblock.motionX} />
    <ValueSlider label="Motion Y" bind:value={settings.macroblock.motionY} min={-0.2} max={0.2} digits={3} def={D.macroblock.motionY} />
    <ValueSlider label="Random motion" bind:value={settings.macroblock.randomMotion} min={0} max={1} def={D.macroblock.randomMotion} />
    <ValueSlider label="Passes" bind:value={settings.macroblock.iterations} min={1} max={6} step={1} digits={0} def={D.macroblock.iterations} />
    <label class="check-row"><input class="check" type="checkbox" bind:checked={settings.macroblock.smear} /> Smear (P-frame bleed)</label>
  </EffectSection>

  <EffectSection title="Pixel sorting" icon="sort" bind:enabled={settings.pixelSort.isEnabled} subsection expanded={false}>
    <ValueSlider label="Lower threshold" bind:value={settings.pixelSort.lower} min={0} max={1} def={D.pixelSort.lower} />
    <ValueSlider label="Upper threshold" bind:value={settings.pixelSort.upper} min={0} max={1} def={D.pixelSort.upper} />
    <label class="check-row"><input class="check" type="checkbox" bind:checked={settings.pixelSort.vertical} /> Vertical</label>
    <label class="check-row"><input class="check" type="checkbox" bind:checked={settings.pixelSort.reverse} /> Reverse order</label>
  </EffectSection>

  <EffectSection title="Row / column shift" icon="arrows" bind:enabled={settings.rowShift.isEnabled} subsection expanded={false}>
    <label class="check-row"><input class="check" type="checkbox" bind:checked={settings.rowShift.vertical} /> Shift columns instead of rows</label>
    <ValueSlider label="Probability" bind:value={settings.rowShift.probability} min={0} max={1} def={D.rowShift.probability} />
    <ValueSlider label="Max shift" bind:value={settings.rowShift.maxShift} min={0} max={1} def={D.rowShift.maxShift} />
    <ValueSlider label="Min band" bind:value={settings.rowShift.minBand} min={1} max={200} step={1} digits={0} suffix=" px" def={D.rowShift.minBand} />
    <ValueSlider label="Max band" bind:value={settings.rowShift.maxBand} min={1} max={400} step={1} digits={0} suffix=" px" def={D.rowShift.maxBand} />
  </EffectSection>

  <EffectSection title="Image tearing" icon="bolt" bind:enabled={settings.tearing.isEnabled} subsection expanded={false}>
    <ValueSlider label="Tears" bind:value={settings.tearing.tears} min={1} max={40} step={1} digits={0} def={D.tearing.tears} />
    <ValueSlider label="Max tear height" bind:value={settings.tearing.maxHeight} min={0.005} max={0.3} digits={3} def={D.tearing.maxHeight} />
    <ValueSlider label="Max offset" bind:value={settings.tearing.maxOffset} min={0} max={0.5} def={D.tearing.maxOffset} />
    <ValueSlider label="RGB split" bind:value={settings.tearing.rgbSplit} min={0} max={0.1} digits={3} def={D.tearing.rgbSplit} />
    <ValueSlider label="Stuck scanlines" bind:value={settings.tearing.stuckLines} min={0} max={1} def={D.tearing.stuckLines} />
  </EffectSection>

  <EffectSection title="RGB channel shift" icon="rgb" bind:enabled={settings.channelShift.isEnabled} subsection expanded={false}>
    <ValueSlider label="Red X" bind:value={settings.channelShift.redX} min={-0.1} max={0.1} digits={3} def={D.channelShift.redX} />
    <ValueSlider label="Red Y" bind:value={settings.channelShift.redY} min={-0.1} max={0.1} digits={3} def={D.channelShift.redY} />
    <ValueSlider label="Blue X" bind:value={settings.channelShift.blueX} min={-0.1} max={0.1} digits={3} def={D.channelShift.blueX} />
    <ValueSlider label="Blue Y" bind:value={settings.channelShift.blueY} min={-0.1} max={0.1} digits={3} def={D.channelShift.blueY} />
  </EffectSection>

  <EffectSection title="Databending" icon="chip" bind:enabled={settings.databend.isEnabled} subsection expanded={false}>
    <Picker label="Mode" bind:value={settings.databend.mode} items={DATABEND_MODES} />
    <ValueSlider label="Glitches" bind:value={settings.databend.glitches} min={1} max={64} step={1} digits={0} def={D.databend.glitches} />
    <ValueSlider label="Chunk size" bind:value={settings.databend.chunkSize} min={0.001} max={0.2} digits={3} def={D.databend.chunkSize} />
    {#if settings.databend.mode !== 'shift'}
      <ValueSlider label="Corruption" bind:value={settings.databend.intensity} min={0} max={1} def={D.databend.intensity} />
    {/if}
  </EffectSection>
</EffectSection>

<style>
  .seed {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-variant-numeric: tabular-nums;
  }
</style>
