<script lang="ts">
  import type { EditorState } from '../editor.svelte';
  import { BUILT_IN_PRESETS } from '../model/presets';
  import Icon from './Icon.svelte';

  let { editor, onsave }: { editor: EditorState; onsave: () => void } = $props();

  let open = $state(false);
  let root = $state<HTMLDivElement>();

  function onwindowpointerdown(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }
</script>

<svelte:window onpointerdown={onwindowpointerdown} onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<div class="preset-bar">
  <div class="menu-wrap" bind:this={root}>
    <button type="button" class="btn menu-btn" aria-haspopup="menu" aria-expanded={open} title="Apply a saved combination of effects"
      onclick={() => (open = !open)}>
      <Icon name="stack" size={14} />
      <span class="name">{editor.matchingPreset?.name ?? 'Presets'}</span>
      <Icon name="chevronDown" size={11} />
    </button>
    {#if open}
      <div class="menu" role="menu">
        {#if editor.userPresets.length}
          <div class="group">My Presets</div>
          {#each editor.userPresets as preset (preset.id)}
            <div class="item-row">
              <button type="button" role="menuitem" class="item" onclick={() => { editor.applyPreset(preset); open = false; }}>{preset.name}</button>
              <button type="button" class="row-action" title="Share “{preset.name}” as a link" aria-label="Share preset {preset.name}"
                onclick={() => { editor.sharePreset(preset); open = false; }}><Icon name="link" size={12} /></button>
              <button type="button" class="row-action delete" title="Delete “{preset.name}”" aria-label="Delete preset {preset.name}"
                onclick={() => editor.deletePreset(preset)}><Icon name="trash" size={12} /></button>
            </div>
          {/each}
          <hr />
        {/if}
        <div class="group">Built-in</div>
        {#each BUILT_IN_PRESETS as preset (preset.id)}
          <button type="button" role="menuitem" class="item" onclick={() => { editor.applyPreset(preset); open = false; }}>{preset.name}</button>
        {/each}
        <hr />
        <div class="group">Share &amp; Export</div>
        <button type="button" role="menuitem" class="item with-icon" onclick={() => { editor.sharePreset(); open = false; }}>
          <Icon name="link" size={13} /> Share current settings…
        </button>
        <button type="button" role="menuitem" class="item with-icon" onclick={() => { editor.exportPresets('current'); open = false; }}>
          <Icon name="save" size={13} /> Export current settings…
        </button>
        <button type="button" role="menuitem" class="item with-icon" disabled={!editor.userPresets.length}
          title={editor.userPresets.length ? undefined : 'Save a preset first'}
          onclick={() => { editor.exportPresets('mine'); open = false; }}>
          <Icon name="save" size={13} /> Export my presets ({editor.userPresets.length})…
        </button>
        <button type="button" role="menuitem" class="item with-icon" onclick={() => { editor.presentImportPanel(); open = false; }}>
          <Icon name="upload" size={13} /> Import presets…
        </button>
      </div>
    {/if}
  </div>

  <button type="button" class="btn" title="Save the current effects and their order as a preset" onclick={onsave}>
    <Icon name="save" size={14} /> Save
  </button>
  <button type="button" class="btn" title="Turn off all effects and reset them to their defaults" disabled={editor.isDefault}
    onclick={() => (editor.isConfirmingReset = true)}>
    <Icon name="reset" size={14} /> Reset
  </button>
</div>

<style>
  /* The menu spans the whole bar (not just the Presets button) so it always fits the sidebar. */
  .preset-bar {
    position: relative;
    display: flex;
    gap: 8px;
  }
  .menu-wrap {
    flex: 1;
    min-width: 0;
  }
  .menu-btn {
    width: 100%;
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: left;
  }
  .menu {
    position: absolute;
    z-index: 20;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    max-height: 60vh;
    overflow: auto;
    padding: 5px;
    border-radius: calc(8px * var(--round));
    background: var(--material);
    backdrop-filter: blur(24px) saturate(1.6);
    -webkit-backdrop-filter: blur(24px) saturate(1.6);
    box-shadow: var(--shadow-menu);
  }
  .group {
    padding: 4px 8px 2px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-2);
  }
  .item-row {
    display: flex;
  }
  .item {
    flex: 1;
    display: block;
    width: 100%;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 4px 8px;
    border: 0;
    border-radius: calc(4px * var(--round));
    background: none;
    text-align: left;
    cursor: pointer;
  }
  .item.with-icon {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .item:hover:not(:disabled),
  .item:focus-visible {
    background: var(--accent);
    color: var(--on-accent);
    outline: none;
  }
  .item:disabled {
    color: var(--text-3);
    cursor: default;
  }
  .row-action {
    padding: 0 6px;
    border: 0;
    border-radius: calc(4px * var(--round));
    background: none;
    color: var(--text-2);
    cursor: pointer;
  }
  .row-action:hover {
    color: var(--accent);
  }
  .delete:hover {
    color: var(--danger);
  }
  @media (pointer: coarse) {
    .item {
      padding: 10px 10px;
    }
    .row-action {
      padding: 0 12px;
    }
  }
  hr {
    margin: 4px 6px;
    border: 0;
    border-top: 0.5px solid var(--border-strong);
  }
</style>
