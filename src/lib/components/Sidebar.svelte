<script lang="ts">
  import { flip } from 'svelte/animate';
  import type { EditorState } from '../editor.svelte';
  import { STAGE_TITLES, type EffectStage } from '../model/settings';
  import AdjustSection from './AdjustSection.svelte';
  import AsciiSection from './AsciiSection.svelte';
  import DitherSection from './DitherSection.svelte';
  import type { StageReorder } from './EffectSection.svelte';
  import GlitchSection from './GlitchSection.svelte';
  import PresetBar from './PresetBar.svelte';

  let { editor, onsavepreset }: { editor: EditorState; onsavepreset: () => void } = $props();

  const reorder = (stage: EffectStage): StageReorder => ({
    position: editor.order.indexOf(stage) + 1,
    canMoveUp: editor.canMove(stage, -1),
    canMoveDown: editor.canMove(stage, 1),
    move: (delta) => editor.move(stage, delta),
  });
</script>

<div class="sidebar">
  <PresetBar {editor} onsave={onsavepreset} />

  <AdjustSection bind:settings={editor.settings.adjust} />

  {#each editor.order as stage (stage)}
    <div animate:flip={{ duration: 250 }}>
      {#if stage === 'glitch'}
        <GlitchSection bind:settings={editor.settings.glitch} reorder={reorder(stage)} reseed={editor.reseed} />
      {:else if stage === 'dither'}
        <DitherSection bind:settings={editor.settings.dither} reorder={reorder(stage)} />
      {:else}
        <AsciiSection bind:settings={editor.settings.ascii} reorder={reorder(stage)} hasText={editor.asciiText !== null}
          copy={() => editor.copyAsciiText()} exportText={() => editor.exportAsciiText()} />
      {/if}
    </div>
  {/each}

  <p class="footnote">
    Effects run top to bottom: Adjust → {editor.order.map((s) => STAGE_TITLES[s]).join(' → ')}. Double-click a slider
    handle to reset it.
  </p>
</div>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
  }
  .footnote {
    margin: 0;
    padding: 0 4px;
    font-size: 11px;
    color: var(--text-3);
  }
</style>
