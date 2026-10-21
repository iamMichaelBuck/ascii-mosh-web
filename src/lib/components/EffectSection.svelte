<script lang="ts" module>
  /** Up/down controls shown in the header of a movable effect stage. */
  export interface StageReorder {
    position: number;
    canMoveUp: boolean;
    canMoveDown: boolean;
    move: (delta: number) => void;
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { slide } from 'svelte/transition';
  import Icon, { type IconName } from './Icon.svelte';
  import Switch from './Switch.svelte';

  let {
    title,
    icon,
    enabled = $bindable(),
    subsection = false,
    expanded: initiallyExpanded = true,
    reorder,
    children,
  }: {
    title: string;
    icon: IconName;
    enabled: boolean;
    subsection?: boolean;
    expanded?: boolean;
    reorder?: StageReorder;
    children: Snippet;
  } = $props();

  // svelte-ignore state_referenced_locally
  let expanded = $state(initiallyExpanded);

  // Turning an effect on reveals its controls.
  let wasEnabled = enabled;
  $effect(() => {
    if (enabled && !wasEnabled) expanded = true;
    wasEnabled = enabled;
  });
</script>

<section class="effect" class:subsection>
  <header>
    <button type="button" class="disclosure" aria-expanded={expanded} onclick={() => (expanded = !expanded)}>
      <span class="chevron" class:open={expanded}><Icon name="chevronRight" size={12} /></span>
      <span class="label" class:off={!enabled}>
        <Icon name={icon} size={subsection ? 14 : 16} />
        <span class="title">{title}</span>
      </span>
    </button>

    {#if reorder}
      <span class="position" title="Position in the processing order">{reorder.position}</span>
      <span class="reorder">
        <button type="button" disabled={!reorder.canMoveUp} title="Apply {title} earlier" aria-label="Apply {title} earlier"
          onclick={() => reorder.move(-1)}><Icon name="chevronUp" size={12} /></button>
        <button type="button" disabled={!reorder.canMoveDown} title="Apply {title} later" aria-label="Apply {title} later"
          onclick={() => reorder.move(1)}><Icon name="chevronDown" size={12} /></button>
      </span>
    {/if}

    <Switch bind:checked={enabled} label={title} small={subsection} />
  </header>

  {#if expanded}
    <div class="content" class:dim={!enabled} transition:slide={{ duration: 180 }}>
      {@render children()}
    </div>
  {/if}
</section>

<style>
  .effect {
    padding: 12px;
    border-radius: calc(12px * var(--round));
    background: var(--card);
  }
  .effect.subsection {
    padding: 8px;
    border-radius: calc(8px * var(--round));
    background: var(--subcard);
  }
  header {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .disclosure {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
    text-align: left;
  }
  .chevron {
    color: var(--text-2);
    transition: transform 0.2s cubic-bezier(0.3, 0.7, 0.4, 1);
  }
  .chevron.open {
    transform: rotate(90deg);
  }
  .label {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-weight: 600;
    font-size: 13px;
  }
  .subsection .label {
    font-weight: 500;
    font-size: 12.5px;
  }
  .label.off {
    color: var(--text-2);
  }
  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .position {
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    border-radius: calc(50% * var(--round));
    background: var(--fill-quaternary);
    color: var(--text-2);
    font-size: 10px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .reorder {
    display: flex;
    border-radius: calc(5px * var(--round));
    box-shadow: var(--shadow);
    overflow: hidden;
  }
  .reorder button {
    display: grid;
    place-items: center;
    width: 20px;
    height: 18px;
    padding: 0;
    border: 0;
    background: var(--control);
    cursor: pointer;
  }
  .reorder button + button {
    border-left: 0.5px solid var(--border);
  }
  .reorder button:disabled {
    color: var(--text-3);
    cursor: default;
  }
  .content {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 10px;
    transition: opacity 0.15s;
  }
  .content.dim {
    opacity: 0.45;
  }
</style>
