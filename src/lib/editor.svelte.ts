import {
  BUILT_IN_PRESETS, PRESET_FILE_EXTENSION, PresetStorage, encodePresetFile, parsePresetFile, readShareLink, shareLink,
  type PresetData, type SavedPreset,
} from './model/presets';
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

export type InterfaceStyle = 'mac' | 'cyber' | 'paper';
export const INTERFACE_STYLES: { id: InterfaceStyle; title: string }[] = [
  { id: 'mac', title: 'macOS' },
  { id: 'cyber', title: 'Cyberpunk' },
  { id: 'paper', title: 'Off-white' },
];
const STYLE_KEY = 'asciimosh.interfaceStyle';

function loadInterfaceStyle(): InterfaceStyle {
  try {
    let v = localStorage.getItem(STYLE_KEY);
    if (v === 'win95') v = 'paper'; // the Windows 95 style was replaced by Off-white
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
  /** The link shown in the Share dialog. */
  sharing = $state<{ name: string; url: string } | null>(null);
  /** A preset that arrived through a share link and has been applied, pending "save to my presets". */
  incomingPreset = $state<PresetData | null>(null);
  /** Short confirmation shown at the bottom of the window. */
  toast = $state<string | null>(null);
  private toastTimer = 0;

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

  /** Opens the first image; failing that, imports the first preset file. Returns whether anything was used. */
  openFiles(files: FileList | File[] | null | undefined) {
    const list = [...(files ?? [])];
    const file = list.find((f) => f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|bmp|svg|heic)$/i.test(f.name));
    if (file) {
      this.open(file, file.name);
      return true;
    }
    const presets = list.find((f) => f.type === 'application/json' || /\.json$/i.test(f.name));
    if (presets) this.importPresetFile(presets);
    return !!presets;
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

  /** The current settings as a preset, named after the matching one if there is one. */
  get currentPreset(): PresetData {
    return { name: this.matchingPreset?.name ?? 'My settings', settings: $state.snapshot(this.settings) };
  }

  /**
   * Adds presets to My Presets. An identical preset with the same name is reused; a different one with a taken
   * name gets a numbered name instead of overwriting it. Returns the presets as stored.
   */
  addPresets(incoming: PresetData[]): SavedPreset[] {
    const sameName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
    const added = incoming.map((p) => {
      // snapshot (not structuredClone): `p` may be a reactive proxy, which can't be cloned directly.
      const settings = $state.snapshot(p.settings);
      const twin = this.userPresets.find((u) => sameName(u.name, p.name) && deepEqual($state.snapshot(u.settings), settings));
      if (twin) return twin;
      let name = p.name;
      for (let n = 2; this.userPresets.some((u) => sameName(u.name, name)); n++) name = `${p.name} (${n})`;
      const preset = { id: crypto.randomUUID(), name, settings };
      this.userPresets.push(preset);
      return preset;
    });
    this.userPresets.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    PresetStorage.save($state.snapshot(this.userPresets));
    return added;
  }

  notify(message: string) {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toast = null), 2600);
  }

  // MARK: - Sharing presets

  sharePreset(preset: PresetData = this.currentPreset) {
    this.sharing = { name: preset.name, url: shareLink({ name: preset.name, settings: $state.snapshot(preset.settings) }) };
  }

  async copyShareLink() {
    if (!this.sharing) return;
    try {
      await navigator.clipboard.writeText(this.sharing.url);
      this.notify('Link copied');
    } catch {
      // Embedded browsers and older ones may refuse the async clipboard; the legacy copy often still works.
      if (legacyCopy(this.sharing.url)) this.notify('Link copied');
      else this.errorMessage = 'Could not write to the clipboard. Select the link and copy it instead.';
    }
  }

  /** The system share sheet (phones, some desktops); `false` if the browser has none. */
  get canShareNatively() {
    return typeof navigator.share === 'function';
  }

  async shareNatively() {
    if (!this.sharing) return;
    try {
      await navigator.share({ title: `ASCII Mosh preset: ${this.sharing.name}`, url: this.sharing.url });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) this.copyShareLink();
    }
  }

  /** Applies a preset from a share link in the address bar, then removes it from the URL so a reload doesn't reapply it. */
  openShareLinkFromLocation() {
    if (!location.hash) return;
    const preset = readShareLink(location.hash);
    if (!preset) return;
    history.replaceState(null, '', location.pathname + location.search);
    // Separate copies: editing the live settings must not change what "Save to My Presets" stores.
    this.settings = structuredClone(preset.settings);
    this.incomingPreset = preset;
  }

  saveIncomingPreset() {
    if (!this.incomingPreset) return;
    const [saved] = this.addPresets([this.incomingPreset]);
    this.incomingPreset = null;
    this.notify(`Saved “${saved.name}” to My Presets`);
  }

  // MARK: - Preset files

  async exportPresets(which: 'current' | 'mine') {
    const presets = which === 'current' ? [this.currentPreset] : $state.snapshot(this.userPresets).map(({ name, settings }) => ({ name, settings }));
    if (!presets.length) return;
    const slug = (which === 'current' ? presets[0].name : 'ascii-mosh-presets').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'preset';
    const name = slug + PRESET_FILE_EXTENSION;
    const handle = await pickSaveFile(name, 'ASCII Mosh presets', 'application/json', '.json');
    if (handle === null) return;
    try {
      await saveBlob(new Blob([encodePresetFile(presets)], { type: 'application/json' }), name, handle);
      this.notify(which === 'current' ? 'Settings exported' : `Exported ${presets.length} preset${presets.length === 1 ? '' : 's'}`);
    } catch (err) {
      this.errorMessage = err instanceof Error ? err.message : String(err);
    }
  }

  presentImportPanel() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => input.files?.[0] && this.importPresetFile(input.files[0]);
    input.click();
  }

  /** Adds the file's presets to My Presets; a file with a single preset is also applied. */
  async importPresetFile(file: Blob) {
    try {
      if (file.size > 5_000_000) throw new Error('The file is too large to be a preset file.');
      const imported = parsePresetFile(await file.text());
      const before = this.userPresets.length;
      const added = this.addPresets(imported);
      const fresh = this.userPresets.length - before;
      if (added.length === 1) {
        this.applyPreset(added[0]);
        this.notify(fresh ? `Imported and applied “${added[0].name}”` : `Applied “${added[0].name}” (already in My Presets)`);
      } else {
        const known = added.length - fresh;
        this.notify(`Imported ${fresh} preset${fresh === 1 ? '' : 's'}${known ? ` (${known} already in My Presets)` : ''}`);
      }
    } catch (err) {
      this.errorMessage = `Import failed: ${err instanceof Error ? err.message : String(err)}`;
    }
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

function legacyCopy(text: string): boolean {
  const area = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
  area.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  // Inside an open <dialog>, only elements in the dialog can take the selection.
  (document.querySelector('dialog[open]') ?? document.body).append(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
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
