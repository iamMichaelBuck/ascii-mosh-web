<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    open = $bindable(),
    title,
    children,
    actions,
  }: { open: boolean; title: string; children?: Snippet; actions: Snippet } = $props();

  let dialog = $state<HTMLDialogElement>();

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });
</script>

<dialog bind:this={dialog} onclose={() => (open = false)} aria-labelledby="modal-title">
  <h2 id="modal-title">{title}</h2>
  {#if children}<div class="body">{@render children()}</div>{/if}
  <div class="actions">{@render actions()}</div>
</dialog>

<style>
  dialog {
    width: min(380px, calc(100vw - 32px));
    padding: 20px;
    border: 0;
    border-radius: 12px;
    background: var(--sidebar);
    color: var(--text);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35), 0 0 0 0.5px var(--border-strong);
  }
  dialog[open] {
    animation: pop 0.16s cubic-bezier(0.3, 0.7, 0.4, 1.1);
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.25);
  }
  h2 {
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 600;
  }
  .body {
    color: var(--text-2);
    font-size: 12.5px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
  }
  @keyframes pop {
    from {
      transform: scale(0.96);
      opacity: 0;
    }
  }
</style>
