<script lang="ts">
  import type { EditorState } from '../editor.svelte';
  import Icon from './Icon.svelte';

  let { editor }: { editor: EditorState } = $props();

  let stage = $state<HTMLDivElement>();
  let canvas = $state<HTMLCanvasElement>();
  let width = $state(0);
  let height = $state(0);
  let isTargeted = $state(false);
  let isPanning = $state(false);
  let animating = $state(false);

  const displayed = $derived(editor.isShowingOriginal ? editor.proxyImage : (editor.previewImage ?? editor.proxyImage));
  const dims = $derived(displayed ? { w: displayed.width, h: displayed.height } : null);
  const fit = $derived(dims ? Math.min(Math.max(1, width - 48) / dims.w, Math.max(1, height - 96) / dims.h) : 1);
  // Magnified dithers/ASCII stay crisp; downscaled photos stay smooth.
  const pixelated = $derived(fit * editor.zoom >= 1);

  $effect(() => {
    editor.fitScale = fit;
  });

  $effect(() => {
    if (!canvas || !displayed) return;
    try {
      if (canvas.width !== displayed.width) canvas.width = displayed.width;
      if (canvas.height !== displayed.height) canvas.height = displayed.height;
      canvas.getContext('2d', { alpha: false })!.drawImage(displayed, 0, 0);
    } catch {
      // The bitmap was replaced (and closed) before this frame drew; the next effect run draws the new one.
    }
  });

  const anchorOf = (clientX: number, clientY: number) => {
    const r = stage!.getBoundingClientRect();
    return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 };
  };

  // Wheel / trackpad: scroll zooms slowly around the pointer; pinch (ctrl+wheel in browsers) zooms faster.
  $effect(() => {
    const el = stage;
    if (!el) return;
    const onwheel = (e: WheelEvent) => {
      if (!editor.hasImage) return;
      e.preventDefault();
      let dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      dy = Math.max(-120, Math.min(120, dy));
      editor.setZoom(editor.zoom * Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.004)), anchorOf(e.clientX, e.clientY));
    };
    el.addEventListener('wheel', onwheel, { passive: false });
    return () => el.removeEventListener('wheel', onwheel);
  });

  // Pointer drag pans; two touch points pinch-zoom.
  const pointers = new Map<number, { x: number; y: number }>();
  let dragStart: { x: number; y: number; pan: { x: number; y: number } } | null = null;
  let pinchStart: { dist: number; zoom: number } | null = null;

  const pinchMetrics = () => {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  function restartGesture() {
    dragStart = null;
    pinchStart = null;
    if (pointers.size === 1) {
      const [p] = pointers.values();
      dragStart = { ...p, pan: { ...editor.pan } };
    } else if (pointers.size === 2) {
      pinchStart = { dist: pinchMetrics().dist, zoom: editor.zoom };
    }
    isPanning = pointers.size > 0;
  }

  function onpointerdown(e: PointerEvent) {
    if (!editor.hasImage || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if ((e.target as Element).closest('button, .status')) return;
    stage!.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    restartGesture();
  }

  function onpointermove(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchStart && pointers.size === 2) {
      const { dist, mid } = pinchMetrics();
      editor.setZoom((pinchStart.zoom * dist) / Math.max(1, pinchStart.dist), anchorOf(mid.x, mid.y));
    } else if (dragStart) {
      editor.pan = { x: dragStart.pan.x + e.clientX - dragStart.x, y: dragStart.pan.y + e.clientY - dragStart.y };
    }
  }

  function onpointerup(e: PointerEvent) {
    if (!pointers.delete(e.pointerId)) return;
    restartGesture();
  }

  function fitAnimated() {
    animating = true;
    editor.zoomToFit();
    setTimeout(() => (animating = false), 260);
  }

  function ondragover(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    isTargeted = true;
  }

  function ondragleave(e: DragEvent) {
    if (!stage?.contains(e.relatedTarget as Node)) isTargeted = false;
  }

  function ondrop(e: DragEvent) {
    e.preventDefault();
    isTargeted = false;
    if (!editor.openFiles(e.dataTransfer?.files)) editor.errorMessage = 'The dropped item is not an image.';
  }
</script>

<div
  class="stage"
  class:panning={isPanning}
  class:has-image={editor.hasImage}
  bind:this={stage}
  bind:clientWidth={width}
  bind:clientHeight={height}
  role="application"
  aria-label="Image preview. Drag to pan, scroll to zoom, double-click to fit."
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  onpointercancel={onpointerup}
  ondblclick={(e) => !(e.target as Element).closest('.status') && fitAnimated()}
  {ondragover}
  {ondragleave}
  {ondrop}
>
  {#if dims}
    <canvas
      bind:this={canvas}
      class:pixelated
      class:animating
      style:width="{dims.w * fit}px"
      style:height="{dims.h * fit}px"
      style:transform="translate({editor.pan.x}px, {editor.pan.y}px) scale({editor.zoom})"
    ></canvas>
  {:else}
    <div class="dropzone" class:targeted={isTargeted}>
      <Icon name="imagePlus" size={48} />
      <div class="dz-title">Drop an image here</div>
      <div class="secondary">or paste one (⌘V / Ctrl+V)</div>
      <button type="button" class="btn primary" onclick={() => editor.presentOpenPanel()}>Open Image…</button>
    </div>
  {/if}

  {#if isTargeted && editor.hasImage}
    <div class="drop-overlay"></div>
  {/if}

  {#if editor.hasImage}
    <div class="status" role="status">
      {#if editor.fileName}<span class="strong">{editor.fileName}</span>{/if}
      {#if editor.sourceImage}<span class="secondary">{editor.sourceImage.width} × {editor.sourceImage.height}</span>{/if}
      <button type="button" class="zoom secondary" title="Zoom (double-click the canvas to fit)" onclick={fitAnimated}>
        {editor.zoomPercent}%
      </button>
      {#if editor.isShowingOriginal}<span class="orange">Original</span>{/if}
      {#if editor.isRendering || editor.isExporting}
        <span class="spinner" aria-hidden="true"></span>
        <span class="secondary">{editor.isExporting ? 'Exporting…' : 'Rendering…'}</span>
      {:else}
        <span class="tertiary num">{Math.round(editor.lastRenderDuration)} ms</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .stage {
    position: relative;
    height: 100%;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: var(--canvas);
    touch-action: none;
    user-select: none;
  }
  .stage.has-image {
    cursor: grab;
  }
  .stage.panning {
    cursor: grabbing;
  }
  canvas {
    grid-area: 1 / 1;
    display: block;
    box-shadow: var(--shadow-image);
    will-change: transform;
    image-rendering: auto;
  }
  canvas.pixelated {
    image-rendering: pixelated;
  }
  canvas.animating {
    transition: transform 0.25s cubic-bezier(0.3, 0.7, 0.4, 1);
  }
  .dropzone {
    grid-area: 1 / 1;
    width: calc(100% - 64px);
    height: calc(100% - 64px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    border: 2px dashed color-mix(in srgb, var(--text-2) 50%, transparent);
    border-radius: calc(20px * var(--round));
    color: var(--text-2);
    text-align: center;
    padding: 16px;
    transition: border-color 0.15s, background 0.15s, color 0.15s;
  }
  .dropzone.targeted {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
  }
  .dz-title {
    font-size: 20px;
    font-weight: 500;
    color: var(--text);
  }
  .dropzone .btn {
    margin-top: 4px;
    height: 30px;
    padding: 0 16px;
  }
  .drop-overlay {
    position: absolute;
    inset: 12px;
    border: 3px solid var(--accent);
    border-radius: calc(16px * var(--round));
    background: var(--accent-soft);
    pointer-events: none;
  }
  .status {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: calc(100% - 24px);
    padding: 5px 12px;
    border-radius: calc(999px * var(--round));
    background: var(--material);
    backdrop-filter: blur(20px) saturate(1.6);
    -webkit-backdrop-filter: blur(20px) saturate(1.6);
    box-shadow: var(--shadow-float);
    font-size: 11.5px;
    white-space: nowrap;
    cursor: default;
  }
  .strong {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .num,
  .zoom {
    font-variant-numeric: tabular-nums;
  }
  .zoom {
    padding: 0;
    border: 0;
    background: none;
    font-size: inherit;
    cursor: pointer;
  }
  .orange {
    color: var(--orange);
  }
  .spinner {
    width: 10px;
    height: 10px;
    border: 1.5px solid var(--text-3);
    border-top-color: var(--text);
    border-radius: calc(50% * var(--round));
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
