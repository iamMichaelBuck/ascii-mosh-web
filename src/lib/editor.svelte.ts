import { BUILT_IN_PRESETS, PresetStorage, type SavedPreset } from './model/presets';
import { deepEqual, defaultSettings, normalizedOrder, type EffectStage, type RenderSettings } from './model/settings';
import { REFERENCE_SIZE } from './processing/pipeline';
import type { WorkerRequest, WorkerResponse } from './processing/worker';
import RenderWorker from './processing/worker?worker';

export type AppearanceMode = 'system' | 'light' | 'dark';
const APPEARANCE_KEY = 'asciimosh.appearance';

function loadAppearance(): AppearanceMode {
  try {
    const v = localStorage.getItem(APPEARANCE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export type InterfaceStyle = 'mac' | 'cyber' | 'win95';
export const INTERFACE_STYLES: { id: InterfaceStyle; title: string }[] = [
  { id: 'mac', title: 'macOS' },
  { id: 'cyber', title: 'Cyberpunk' },
  { id: 'win95', title: 'Windows 95' },
];
const STYLE_KEY = 'asciimosh.interfaceStyle';

function loadInterfaceStyle(): InterfaceStyle {
  try {
    const v = localStorage.getItem(STYLE_KEY);
    return INTERFACE_STYLES.some((s) => s.id === v) ? (v as InterfaceStyle) : 'cyber';
  } catch {
    return 'cyber';
  }
}

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 64;

export class EditorState {
  settings = $state<RenderSettings>(defaultSettings());

  /** Full-resolution decoded source, used only for export. */
  sourceImage = $state.raw<ImageBitmap | null>(null);
  /** Preview-sized source (long edge ≤ 1600), shown when comparing with the original. */
  proxyImage = $state.raw<ImageBitmap | null>(null);
  previewImage = $state.raw<ImageBitmap | null>(null);
  asciiText = $state<string | null>(null);
  fileName = $state<string | null>(null);
  isRendering = $state(false);
  isExporting = $state(false);
  lastRenderDuration = $state(0);
  showOriginal = $state(false);
  /** True only while the spacebar is held down. */
  isPeekingOriginal = $state(false);
  errorMessage = $state<string | null>(null);

  // Canvas viewport. `zoom` is relative to the fit-to-window size; `pan` is in CSS pixels.
  zoom = $state(1);
  pan = $state({ x: 0, y: 0 });
  /** Scale at which the displayed image fits the canvas (zoom 1); reported by the canvas. */
  fitScale = $state(1);

  userPresets = $state<SavedPreset[]>(PresetStorage.load());
  isSavingPreset = $state(false);
  isConfirmingReset = $state(false);

  appearance = $state<AppearanceMode>(loadAppearance());
  interfaceStyle = $state<InterfaceStyle>(loadInterfaceStyle());

  hasImage = $derived(this.sourceImage !== null);
  isShowingOriginal = $derived(this.showOriginal || this.isPeekingOriginal);
  order = $derived(normalizedOrder(this.settings.order));
  isDefault = $derived(deepEqual(this.settings, defaultSettings()));
  /** The preset whose settings match the current ones exactly, if any. */
  matchingPreset = $derived([...this.userPresets, ...BUILT_IN_PRESETS].find((p) => deepEqual(p.settings, this.settings)) ?? null);
  /** Zoom as a percentage of the image's pixel size. */
  zoomPercent = $derived(Math.round(this.zoom * this.fitScale * 100));

  private worker: Worker = new RenderWorker();
  private imageId = 0;
  private needsRender = false;
  private busy = false;
  private pending: RenderSettings | null = null;

  constructor() {
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.onWorkerMessage(e.data);
    this.worker.onerror = (e) => {
      this.busy = this.isRendering = false;
      this.errorMessage = e.message || 'The render worker crashed.';
    };
  }

  private post(msg: WorkerRequest, transfer: Transferable[] = []) {
    this.worker.postMessage(msg, transfer);
  }

  // MARK: - Loading

  async open(file: Blob, name: string) {
    try {
      const full = await decode(file);
      const longEdge = Math.max(full.width, full.height);
      const k = REFERENCE_SIZE / longEdge;
      const proxy = longEdge > REFERENCE_SIZE
        ? await createImageBitmap(full, { resizeWidth: Math.round(full.width * k), resizeHeight: Math.round(full.height * k), resizeQuality: 'high' })
        : await createImageBitmap(full);
      const workerCopy = await createImageBitmap(proxy);

      this.sourceImage?.close();
      this.proxyImage?.close();
      this.previewImage?.close();
      this.sourceImage = full;
      this.proxyImage = proxy;
      this.previewImage = null;
      this.asciiText = null;
      this.fileName = name.replace(/\.[^.]+$/, '') || 'image';
      this.showOriginal = false;
      this.post({ type: 'image', imageId: ++this.imageId, bitmap: workerCopy }, [workerCopy]);
      this.zoomToFit();
      this.scheduleRender($state.snapshot(this.settings));
    } catch {
      this.errorMessage = 'The file could not be opened as an image.';
    }
  }

  openFiles(files: FileList | File[] | null | undefined) {
    const file = [...(files ?? [])].find((f) => f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|bmp|svg|heic)$/i.test(f.name));
    if (file) this.open(file, file.name);
    return !!file;
  }

  presentOpenPanel() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => this.openFiles(input.files);
    input.click();
  }

  async pasteImage() {
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) return this.open(await item.getType(type), 'Pasted Image');
      }
      this.errorMessage = 'The clipboard does not contain an image.';
    } catch {
      this.errorMessage = 'Clipboard access was denied. Use ⌘V / Ctrl+V to paste instead.';
    }
  }

  // MARK: - Live rendering

  /** Coalesces rapid setting changes: at most one render runs, followed by one with the latest settings. */
  scheduleRender(settings: RenderSettings) {
    this.pending = settings;
    this.needsRender = true;
    if (!this.busy) this.renderNext();
  }

  private renderNext() {
    if (!this.needsRender || !this.proxyImage || !this.pending) {
      this.busy = this.isRendering = false;
      return;
    }
    this.needsRender = false;
    this.busy = this.isRendering = true;
    this.post({ type: 'render', imageId: this.imageId, settings: this.pending });
  }

  private onWorkerMessage(msg: WorkerResponse) {
    if (msg.type === 'rendered') {
      // Drop results for an image that has since been replaced.
      if (msg.imageId === this.imageId) {
        this.previewImage?.close();
        this.previewImage = msg.bitmap;
        this.asciiText = msg.asciiText;
        this.lastRenderDuration = msg.duration;
      } else {
        msg.bitmap.close();
      }
    } else if (msg.type === 'error') {
      this.errorMessage = msg.message;
    }
    this.renderNext();
  }

  // MARK: - Zoom & pan

  /** Zooms while keeping the point `anchor` (relative to the canvas centre) fixed on screen. */
  setZoom(newZoom: number, anchor = { x: 0, y: 0 }) {
    const clamped = Math.min(Math.max(newZoom, ZOOM_MIN), ZOOM_MAX);
    const ratio = clamped / this.zoom;
    this.pan = { x: anchor.x - (anchor.x - this.pan.x) * ratio, y: anchor.y - (anchor.y - this.pan.y) * ratio };
    this.zoom = clamped;
  }

  zoomIn = () => this.setZoom(this.zoom * 1.25);
  zoomOut = () => this.setZoom(this.zoom / 1.25);
  zoomToFit = () => {
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
  };
  zoomToActualSize = () => this.setZoom(1 / Math.max(this.fitScale, 0.0001));

  // MARK: - Effect order

  canMove(stage: EffectStage, delta: number) {
    const i = this.order.indexOf(stage);
    return i >= 0 && i + delta >= 0 && i + delta < this.order.length;
  }

  move(stage: EffectStage, delta: number) {
    if (!this.canMove(stage, delta)) return;
    const order = [...this.order];
    const i = order.indexOf(stage);
    [order[i], order[i + delta]] = [order[i + delta], order[i]];
    this.settings.order = order;
  }

  // MARK: - Presets

  applyPreset(preset: SavedPreset) {
    this.settings = structuredClone($state.snapshot(preset.settings));
  }

  /** Saves the current settings; an existing preset with the same name is replaced. */
  savePreset(rawName: string) {
    const name = rawName.trim();
    if (!name) return;
    const settings = structuredClone($state.snapshot(this.settings));
    const existing = this.userPresets.find((p) => p.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0);
    if (existing) {
      existing.settings = settings;
    } else {
      this.userPresets.push({ id: crypto.randomUUID(), name, settings });
      this.userPresets.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    }
    PresetStorage.save($state.snapshot(this.userPresets));
  }

  deletePreset(preset: SavedPreset) {
    this.userPresets = this.userPresets.filter((p) => p.id !== preset.id);
    PresetStorage.save($state.snapshot(this.userPresets));
  }

  reseed = () => {
    this.settings.glitch.seed = 1 + Math.floor(Math.random() * 0xfffffffe);
  };

  resetAll() {
    this.settings = defaultSettings();
  }

  // MARK: - Appearance

  setAppearance(mode: AppearanceMode) {
    this.appearance = mode;
    try {
      localStorage.setItem(APPEARANCE_KEY, mode);
    } catch {
      // Not persisted; still applies for this session.
    }
  }

  setInterfaceStyle(style: InterfaceStyle) {
    this.interfaceStyle = style;
    try {
      localStorage.setItem(STYLE_KEY, style);
    } catch {
      // Not persisted; still applies for this session.
    }
  }

  toggleDarkMode() {
    const dark = this.appearance === 'dark' || (this.appearance === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    this.setAppearance(dark ? 'light' : 'dark');
  }

  // MARK: - Export

  private get exportBaseName() {
    return `${this.fileName ?? 'image'}-mosh`;
  }

  async exportImage() {
    if (!this.sourceImage || this.isExporting) return;
    const name = this.exportBaseName + '.png';
    // Ask for the destination first (needs the user gesture), then render at full resolution.
    const handle = await pickSaveFile(name, 'PNG image', 'image/png', '.png');
    if (handle === null) return;

    this.isExporting = true;
    const worker = new RenderWorker();
    try {
      const bitmap = await createImageBitmap(this.sourceImage);
      const result = await new Promise<WorkerResponse>((resolve, reject) => {
        worker.onmessage = (e: MessageEvent<WorkerResponse>) => resolve(e.data);
        worker.onerror = (e) => reject(new Error(e.message));
        worker.postMessage({ type: 'export', bitmap, settings: $state.snapshot(this.settings) } satisfies WorkerRequest, [bitmap]);
      });
      if (result.type !== 'exported') throw new Error(result.type === 'error' ? result.message : 'Export failed.');
      await saveBlob(result.blob, name, handle);
    } catch (err) {
      this.errorMessage = err instanceof Error && err.message ? `Export failed: ${err.message}` : 'Export failed.';
    } finally {
      worker.terminate();
      this.isExporting = false;
    }
  }

  async exportAsciiText() {
    if (this.asciiText === null) return;
    const name = this.exportBaseName + '.txt';
    const handle = await pickSaveFile(name, 'Plain text', 'text/plain', '.txt');
    if (handle === null) return;
    try {
      await saveBlob(new Blob([this.asciiText], { type: 'text/plain;charset=utf-8' }), name, handle);
    } catch (err) {
      this.errorMessage = err instanceof Error ? err.message : String(err);
    }
  }

  async copyAsciiText() {
    if (this.asciiText === null) return;
    try {
      await navigator.clipboard.writeText(this.asciiText);
    } catch {
      this.errorMessage = 'Could not write to the clipboard.';
    }
  }
}

/** Decodes with EXIF orientation applied; falls back to an <img> for formats createImageBitmap rejects (e.g. SVG). */
async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

type SaveTarget = FileSystemFileHandle | 'download';

interface SaveFilePickerWindow {
  showSaveFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle>;
}

/** Native save dialog where supported (Chromium); `null` means the user cancelled. */
async function pickSaveFile(name: string, description: string, mime: string, ext: string): Promise<SaveTarget | null> {
  const w = window as unknown as SaveFilePickerWindow;
  if (!w.showSaveFilePicker) return 'download';
  try {
    return await w.showSaveFilePicker({ suggestedName: name, types: [{ description, accept: { [mime]: [ext] } }] });
  } catch (err) {
    return err instanceof DOMException && err.name === 'AbortError' ? null : 'download';
  }
}

async function saveBlob(blob: Blob, name: string, target: SaveTarget) {
  if (target !== 'download') {
    const writable = await target.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
