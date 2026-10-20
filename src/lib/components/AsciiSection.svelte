<script lang="ts">
  import { ASCII_PRESETS, asciiPreset, CUSTOM_PRESET_ID } from '../model/charsets';
  import { ASCII_COLOR_MODES, defaultAscii, type AsciiSettings } from '../model/settings';
  import ColorRow from './ColorRow.svelte';
  import EffectSection, { type StageReorder } from './EffectSection.svelte';
  import Icon from './Icon.svelte';
  import Picker from './Picker.svelte';
  import ValueSlider from './ValueSlider.svelte';

  let {
    settings = $bindable(),
    reorder,
    hasText,
    copy,
    exportText,
  }: { settings: AsciiSettings; reorder: StageReorder; hasText: boolean; copy: () => void; exportText: () => void } = $props();

  const D = defaultAscii();
  const preset = $derived(asciiPreset(settings.presetID));
  const presetItems = ASCII_PRESETS.map((p) => ({ id: p.id, title: p.name }));
</script>

<EffectSection title="ASCII Art" icon="text" bind:enabled={settings.isEnabled} {reorder}>
  <Picker label="Character set" bind:value={settings.presetID} items={presetItems} />

  {#if preset.id === CUSTOM_PRESET_ID}
    <input class="chars-input" type="text" placeholder="Characters (light → dense)" spellcheck="false" bind:value={settings.customCharacters} />
  {:else if preset.characters}
    <div class="chars">{preset.characters}</div>
  {/if}

  <ValueSlider label="Columns" bind:value={settings.columns} min={10} max={400} step={1} digits={0} def={D.columns} />
  <ValueSlider label="Line spacing" bind:value={settings.lineSpacing} min={0.7} max={1.6} def={D.lineSpacing} />

  <Picker label="Color" bind:value={settings.colorMode} items={ASCII_COLOR_MODES} />
  <div class="colors">
    {#if settings.colorMode === 'mono'}
      <ColorRow label="Text" bind:color={settings.foreground} />
    {/if}
    <ColorRow label="Background" bind:color={settings.background} />
  </div>

  <label class="check-row"><input class="check" type="checkbox" bind:checked={settings.invert} /> Invert mapping</label>
  {#if preset.mode === 'ramp'}
    <label class="check-row"><input class="check" type="checkbox" bind:checked={settings.sortByDensity} /> Sort characters by ink density</label>
    <label class="check-row" class:disabled={!settings.sortByDensity}>
      <input class="check" type="checkbox" bind:checked={settings.toneMatch} disabled={!settings.sortByDensity} /> Match tones to ink coverage
    </label>
  {/if}

  <div class="actions">
    <button type="button" class="btn small" disabled={!hasText} onclick={copy}><Icon name="copy" size={13} /> Copy as Text</button>
    <button type="button" class="btn small" disabled={!hasText} onclick={exportText}><Icon name="fileText" size={13} /> Save .txt</button>
  </div>
</EffectSection>

<style>
  .chars,
  .chars-input {
    font: 13px/1.3 var(--mono);
  }
  .chars {
    padding: 6px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.25);
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    word-break: break-all;
    user-select: text;
  }
  .chars-input {
    width: 100%;
    height: 24px;
    padding: 0 6px;
    border: 0;
    border-radius: 5px;
    background: var(--control);
    box-shadow: var(--shadow);
  }
  .colors,
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  .actions {
    gap: 6px;
  }
  .disabled {
    opacity: 0.5;
  }
</style>
