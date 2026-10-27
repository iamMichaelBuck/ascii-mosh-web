<script lang="ts">
  import { defaultCrt, PHOSPHOR_MASKS, type CrtSettings } from '../model/settings';
  import EffectSection, { type StageReorder } from './EffectSection.svelte';
  import Picker from './Picker.svelte';
  import ValueSlider from './ValueSlider.svelte';

  let { settings = $bindable(), reorder }: { settings: CrtSettings; reorder: StageReorder } = $props();
  const D = defaultCrt();
</script>

<EffectSection title="CRT Screen" icon="tv" bind:enabled={settings.isEnabled} {reorder}>
  <EffectSection title="Scanlines" icon="scanlines" bind:enabled={settings.scanlines.isEnabled} subsection>
    <ValueSlider label="Line spacing" bind:value={settings.scanlines.spacing} min={2} max={24} digits={1} suffix=" px" def={D.scanlines.spacing} />
    <ValueSlider label="Line thickness" bind:value={settings.scanlines.thickness} min={0.1} max={0.9} def={D.scanlines.thickness} />
    <ValueSlider label="Darkness" bind:value={settings.scanlines.intensity} min={0} max={1} def={D.scanlines.intensity} />
    <ValueSlider label="Edge softness" bind:value={settings.scanlines.softness} min={0} max={1} def={D.scanlines.softness} />
    <ValueSlider label="Offset" bind:value={settings.scanlines.offset} min={0} max={1} def={D.scanlines.offset} />
    <label class="check-row"><input class="check" type="checkbox" bind:checked={settings.scanlines.vertical} /> Vertical lines (rotated tube)</label>
  </EffectSection>

  <EffectSection title="Phosphor mask" icon="columns" bind:enabled={settings.mask.isEnabled} subsection expanded={false}>
    <Picker label="Type" bind:value={settings.mask.type} items={PHOSPHOR_MASKS} />
    <ValueSlider label="Triad size" bind:value={settings.mask.size} min={2} max={12} digits={1} suffix=" px" def={D.mask.size} />
    <ValueSlider label="Strength" bind:value={settings.mask.intensity} min={0} max={1} def={D.mask.intensity} />
  </EffectSection>

  <EffectSection title="Glow" icon="sun" bind:enabled={settings.glow.isEnabled} subsection expanded={false}>
    <ValueSlider label="Radius" bind:value={settings.glow.radius} min={1} max={24} digits={1} suffix=" px" def={D.glow.radius} />
    <ValueSlider label="Strength" bind:value={settings.glow.strength} min={0} max={1} def={D.glow.strength} />
  </EffectSection>

  <EffectSection title="Screen" icon="tv" bind:enabled={settings.screen.isEnabled} subsection expanded={false}>
    <ValueSlider label="Curvature" bind:value={settings.screen.curvature} min={0} max={0.3} digits={3} def={D.screen.curvature} />
    <ValueSlider label="Vignette" bind:value={settings.screen.vignette} min={0} max={1} def={D.screen.vignette} />
    <ValueSlider label="Brightness" bind:value={settings.screen.brightness} min={0.5} max={2} def={D.screen.brightness} />
  </EffectSection>
</EffectSection>
