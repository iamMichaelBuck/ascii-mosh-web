<script lang="ts">
  import { untrack } from 'svelte';
  import Canvas from './lib/components/Canvas.svelte';
  import Icon from './lib/components/Icon.svelte';
  import Modal from './lib/components/Modal.svelte';
  import Sidebar from './lib/components/Sidebar.svelte';
  import { EditorState, type AppearanceMode } from './lib/editor.svelte';

  const editor = new EditorState();
  if (import.meta.env.DEV) (window as unknown as { editor: EditorState }).editor = editor;

  // Re-render whenever any setting changes (the snapshot reads every field, so all are tracked).
  $effect(() => {
    const snapshot = $state.snapshot(editor.settings);
    untrack(() => editor.scheduleRender(snapshot));
  });

  $effect(() => {
    const root = document.documentElement;
    if (editor.appearance === 'system') delete root.dataset.theme;
    else root.dataset.theme = editor.appearance;
  });

  $effect(() => {
    document.title = editor.fileName ? `${editor.fileName} — ASCII Mosh` : 'ASCII Mosh';
  });

  // MARK: Sidebar width (300…440, like the macOS split view)

  const WIDTH_KEY = 'asciimosh.sidebarWidth';
  let sidebarWidth = $state(readWidth());
  function readWidth() {
    try {
      return Math.min(440, Math.max(300, Number(localStorage.getItem(WIDTH_KEY)) || 330));
    } catch {
      return 330;
    }
  }
  function startResize(e: PointerEvent) {
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX, startW = sidebarWidth;
    const move = (ev: PointerEvent) => (sidebarWidth = Math.min(440, Math.max(300, startW + ev.clientX - startX)));
    const up = () => {
      handle.removeEventListener('pointermove', move);
      try {
        localStorage.setItem(WIDTH_KEY, String(sidebarWidth));
      } catch {}
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up, { once: true });
  }

  // MARK: Dialogs

  let presetName = $state('');
  function beginSavePreset() {
    const match = editor.matchingPreset;
    presetName = match && !match.isBuiltIn ? match.name : '';
    editor.isSavingPreset = true;
  }
  function commitPreset(e: SubmitEvent) {
    e.preventDefault();
    if (!presetName.trim()) return;
    editor.savePreset(presetName);
    editor.isSavingPreset = false;
  }

  const appearanceModes: { id: AppearanceMode; icon: 'system' | 'sun' | 'moon'; title: string }[] = [
    { id: 'system', icon: 'system', title: 'Match System' },
    { id: 'light', icon: 'sun', title: 'Light' },
    { id: 'dark', icon: 'moon', title: 'Dark' },
  ];

  // MARK: Keyboard

  const isTextEntry = (t: EventTarget | null) =>
    t instanceof HTMLElement &&
    (t.isContentEditable || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement ||
      (t instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'color', 'range'].includes(t.type)));

  const anyModalOpen = () => editor.isSavingPreset || editor.isConfirmingReset || editor.errorMessage !== null;

  function onkeydown(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;
    const typing = isTextEntry(e.target);

    // Holding Space shows the unprocessed image; it still types normally in text fields.
    if (e.code === 'Space' && !mod && !e.altKey && !e.shiftKey && !typing && !anyModalOpen()) {
      e.preventDefault();
      if (!e.repeat && editor.hasImage) editor.isPeekingOriginal = true;
      return;
    }

    const key = e.key.toLowerCase();
    const digit = /^Digit[1-4]$/.test(e.code) ? Number(e.code.slice(5)) : 0;
    let handled = true;

    if (mod && !e.altKey && !e.shiftKey && key === 'o') editor.presentOpenPanel();
    else if (mod && !e.altKey && !e.shiftKey && key === 's') editor.exportImage();
    else if (mod && e.altKey && e.code === 'KeyS') beginSavePreset();
    else if (mod && e.shiftKey && key === 'c' && !typing && editor.asciiText !== null) editor.copyAsciiText();
    else if (mod && e.shiftKey && key === 'v') editor.pasteImage();
    else if (mod && e.shiftKey && key === 'd') editor.toggleDarkMode();
    else if (mod && (key === '=' || key === '+') && editor.hasImage) editor.zoomIn();
    else if (mod && key === '-' && editor.hasImage) editor.zoomOut();
    else if (mod && e.altKey && e.code === 'Digit0' && editor.hasImage) editor.zoomToActualSize();
    else if (mod && e.code === 'Digit0' && editor.hasImage) editor.zoomToFit();
    else if (!mod && !typing && digit && !anyModalOpen()) {
      // 1–4 (or ⌥1–4) toggle Adjust, Glitch, Dither, ASCII.
      const s = editor.settings;
      const target = [s.adjust, s.glitch, s.dither, s.ascii][digit - 1];
      target.isEnabled = !target.isEnabled;
    } else if (!mod && !typing && e.code === 'KeyR' && !anyModalOpen()) editor.reseed();
    else if (!mod && !typing && e.code === 'KeyF' && !anyModalOpen()) editor.zoomToFit();
    else handled = false;

    if (handled) e.preventDefault();
  }

  function onkeyup(e: KeyboardEvent) {
    if (e.code === 'Space') editor.isPeekingOriginal = false;
  }

  function onpaste(e: ClipboardEvent) {
    if (isTextEntry(e.target)) return;
    const files = [...(e.clipboardData?.files ?? [])];
    if (editor.openFiles(files)) e.preventDefault();
  }
</script>

<!-- The key-up never arrives if the window loses focus while Space is held. -->
<svelte:window {onkeydown} {onkeyup} {onpaste} onblur={() => (editor.isPeekingOriginal = false)} />

<div class="app" style:--sidebar-w="{sidebarWidth}px">
  <header class="toolbar">
    <div class="title">
      <span class="app-name">{editor.fileName ?? 'ASCII Mosh'}</span>
    </div>
    <div class="tools">
      <button type="button" class="btn icon" title="Open an image (⌘O)" aria-label="Open" onclick={() => editor.presentOpenPanel()}>
        <Icon name="folder" />
      </button>
      <button type="button" class="btn icon" class:active={editor.showOriginal} title="Compare with the unprocessed image (hold Space to peek)"
        aria-label="Show original" aria-pressed={editor.showOriginal} disabled={!editor.hasImage}
        onclick={() => (editor.showOriginal = !editor.showOriginal)}>
        <Icon name={editor.showOriginal ? 'eyeOff' : 'eye'} />
      </button>
      <div class="group" role="group" aria-label="Zoom">
        <button type="button" class="btn icon" title="Zoom out (⌘−)" aria-label="Zoom out" disabled={!editor.hasImage} onclick={editor.zoomOut}>
          <Icon name="zoomOut" />
        </button>
        <button type="button" class="btn icon" title="Zoom to fit (⌘0)" aria-label="Zoom to fit" disabled={!editor.hasImage} onclick={editor.zoomToFit}>
          <Icon name="fit" />
        </button>
        <button type="button" class="btn icon" title="Zoom in (⌘=)" aria-label="Zoom in" disabled={!editor.hasImage} onclick={editor.zoomIn}>
          <Icon name="zoomIn" />
        </button>
      </div>
      <div class="group" role="radiogroup" aria-label="Appearance">
        {#each appearanceModes as mode (mode.id)}
          <button type="button" class="btn icon" class:active={editor.appearance === mode.id} role="radio"
            aria-checked={editor.appearance === mode.id} title="{mode.title} (⇧⌘D toggles)" aria-label={mode.title}
            onclick={() => editor.setAppearance(mode.id)}>
            <Icon name={mode.icon} />
          </button>
        {/each}
      </div>
      <button type="button" class="btn export" title="Save the full-resolution result as PNG (⌘S)"
        disabled={!editor.hasImage || editor.isExporting} onclick={() => editor.exportImage()}>
        <Icon name="share" /> <span class="label">Export</span>
      </button>
    </div>
  </header>

  <aside class="side">
    <Sidebar {editor} onsavepreset={beginSavePreset} />
  </aside>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="resizer" onpointerdown={startResize} title="Drag to resize the sidebar"></div>

  <main class="main">
    <Canvas {editor} />
  </main>
</div>

<Modal bind:open={editor.isSavingPreset} title="Save Preset">
  <p style="margin:0">Stores every effect setting and the effect order. A preset with the same name is replaced.</p>
  <form id="preset-form" onsubmit={commitPreset}>
    <!-- svelte-ignore a11y_autofocus -->
    <input class="text-input" type="text" placeholder="Preset name" bind:value={presetName} autofocus />
  </form>
  {#snippet actions()}
    <button type="button" class="btn" onclick={() => (editor.isSavingPreset = false)}>Cancel</button>
    <button type="submit" form="preset-form" class="btn primary" disabled={!presetName.trim()}>Save</button>
  {/snippet}
</Modal>

<Modal bind:open={editor.isConfirmingReset} title="Reset all effects?">
  <p style="margin:0">
    All currently applied effects will be turned off and every setting, including the effect order, will return to its
    default value. Saved presets are not affected.
  </p>
  {#snippet actions()}
    <button type="button" class="btn" onclick={() => (editor.isConfirmingReset = false)}>Cancel</button>
    <button type="button" class="btn danger" onclick={() => { editor.resetAll(); editor.isConfirmingReset = false; }}>Reset</button>
  {/snippet}
</Modal>

<Modal
  bind:open={() => editor.errorMessage !== null, (v) => { if (!v) editor.errorMessage = null; }}
  title="Something went wrong"
>
  <p style="margin:0">{editor.errorMessage}</p>
  {#snippet actions()}
    <button type="button" class="btn primary" onclick={() => (editor.errorMessage = null)}>OK</button>
  {/snippet}
</Modal>

<style>
  .app {
    height: 100%;
    display: grid;
    grid-template-columns: var(--sidebar-w) 0 1fr;
    grid-template-rows: 44px 1fr;
    grid-template-areas:
      'toolbar toolbar toolbar'
      'side resizer main';
  }
  .toolbar {
    grid-area: toolbar;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 12px 0 16px;
    background: var(--toolbar);
    border-bottom: 0.5px solid var(--border-strong);
    z-index: 2;
  }
  .title {
    min-width: 0;
    font-weight: 600;
    font-size: 13.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .btn.icon {
    width: 32px;
    padding: 0;
    justify-content: center;
  }
  .btn.active {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .group {
    display: flex;
    border-radius: 6px;
    box-shadow: var(--shadow);
  }
  .group .btn {
    box-shadow: none;
    border-radius: 0;
  }
  .group .btn:first-child {
    border-radius: 6px 0 0 6px;
  }
  .group .btn:last-child {
    border-radius: 0 6px 6px 0;
  }
  .group .btn + .btn {
    border-left: 0.5px solid var(--border);
  }
  .side {
    grid-area: side;
    min-height: 0;
    overflow-y: auto;
    background: var(--sidebar);
    border-right: 0.5px solid var(--border-strong);
    overscroll-behavior: contain;
  }
  .resizer {
    grid-area: resizer;
    position: relative;
    z-index: 3;
    width: 8px;
    margin-left: -4px;
    cursor: col-resize;
    touch-action: none;
  }
  .main {
    grid-area: main;
    min-width: 0;
    min-height: 0;
  }
  .text-input {
    width: 100%;
    height: 28px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: var(--control);
    box-shadow: var(--shadow);
    color: var(--text);
  }

  @media (max-width: 760px) {
    .app {
      grid-template-columns: 1fr;
      grid-template-rows: 44px 52vh 1fr;
      grid-template-areas: 'toolbar' 'main' 'side';
    }
    .resizer {
      display: none;
    }
    .side {
      border-right: 0;
      border-top: 0.5px solid var(--border-strong);
    }
    .toolbar {
      padding: 0 8px 0 16px;
    }
    .tools {
      gap: 4px;
    }
    .export .label,
    .group[role='radiogroup'] {
      display: none;
    }
  }
</style>
