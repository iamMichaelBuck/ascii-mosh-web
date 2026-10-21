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
              <button type="button" class="delete" title="Delete “{preset.name}”" aria-label="Delete preset {preset.name}"
                onclick={() => editor.deletePreset(preset)}><Icon name="trash" size={12} /></button>
            </div>
          {/each}
          <hr />
        {/if}
        <div class="group">Built-in</div>
        {#each BUILT_IN_PRESETS as preset (preset.id)}
          <button type="button" role="menuitem" class="item" onclick={() => { editor.applyPreset(preset); open = false; }}>{preset.name}</button>
        {/each}
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
  .preset-bar {
    display: flex;
    gap: 8px;
  }
  .menu-wrap {
    position: relative;
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
    min-width: 230px;
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
    padding: 4px 8px;
    border: 0;
    border-radius: calc(4px * var(--round));
    background: none;
    text-align: left;
    cursor: pointer;
  }
  .item:hover,
  .item:focus-visible {
    background: var(--accent);
    color: var(--on-accent);
    outline: none;
  }
  .delete {
    padding: 0 6px;
    border: 0;
    border-radius: calc(4px * var(--round));
    background: none;
    color: var(--text-2);
    cursor: pointer;
  }
  .delete:hover {
    color: var(--danger);
  }
  hr {
    margin: 4px 6px;
    border: 0;
    border-top: 0.5px solid var(--border-strong);
  }
</style>
