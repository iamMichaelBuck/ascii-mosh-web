import { defaultSettings, diffFromDefaults, rgb, sanitizeSettings, type RenderSettings } from './settings';

/** A named snapshot of every effect setting, including the stage order and glitch seed. */
export interface SavedPreset {
  id: string;
  name: string;
  settings: RenderSettings;
  isBuiltIn?: boolean;
}

function builtIn(id: string, name: string, configure: (s: RenderSettings) => void): SavedPreset {
  const s = defaultSettings();
  configure(s);
  return { id: `builtin.${id}`, name, settings: s, isBuiltIn: true };
}

export const BUILT_IN_PRESETS: SavedPreset[] = [
  builtIn('terminal', 'Green Terminal', (s) => {
    s.ascii.isEnabled = true;
    s.ascii.presetID = 'detailed';
    s.ascii.columns = 140;
    s.ascii.foreground = rgb(0.25, 1, 0.45);
    s.ascii.background = rgb(0.02, 0.05, 0.03);
  }),
  builtIn('colorBlocks', 'True-Color Half Blocks', (s) => {
    s.ascii.isEnabled = true;
    s.ascii.presetID = 'halfBlocks';
    s.ascii.colorMode = 'original';
    s.ascii.columns = 160;
  }),
  builtIn('gameboy', 'Game Boy Camera', (s) => {
    s.adjust.contrast = 1.3;
    s.dither.isEnabled = true;
    s.dither.algorithm = 'bayer4';
    s.dither.colorMode = 'palette';
    s.dither.palette = 'gameBoy';
    s.dither.pixelScale = 3;
  }),
  builtIn('halftone', 'Newspaper Halftone', (s) => {
    s.adjust.contrast = 1.2;
    s.dither.isEnabled = true;
    s.dither.algorithm = 'clusteredDot';
    s.dither.dark = rgb(0.1, 0.1, 0.12);
    s.dither.light = rgb(0.96, 0.94, 0.88);
  }),
  builtIn('brokenJPEG', 'Broken JPEG', (s) => {
    s.glitch.isEnabled = true;
    s.glitch.quant.isEnabled = true;
    s.glitch.quant.quality = 8;
    s.glitch.quant.mismatch = 0.8;
    s.glitch.quant.corruption = 0.01;
    s.glitch.quant.dcDrift = 0.4;
    s.glitch.macroblock.isEnabled = true;
  }),
  builtIn('vhs', 'VHS Tear', (s) => {
    s.glitch.isEnabled = true;
    s.glitch.tearing.isEnabled = true;
    s.glitch.channelShift.isEnabled = true;
    s.glitch.chroma.isEnabled = true;
    s.glitch.chroma.horizontal = 8;
    s.glitch.chroma.offsetX = 0.01;
    s.glitch.rowShift.isEnabled = true;
    s.glitch.rowShift.probability = 0.15;
    s.glitch.rowShift.maxShift = 0.05;
  }),
  builtIn('crtScanlines', 'CRT Scanlines', (s) => {
    s.adjust.contrast = 1.1;
    s.adjust.saturation = 1.15;
    s.crt.isEnabled = true;
    s.crt.scanlines.spacing = 4;
    s.crt.scanlines.intensity = 0.55;
    s.crt.mask.isEnabled = true;
    s.crt.mask.intensity = 0.25;
    s.crt.glow.isEnabled = true;
    s.crt.glow.radius = 5;
    s.crt.glow.strength = 0.4;
    s.crt.screen.isEnabled = true;
    s.crt.screen.curvature = 0.06;
    s.crt.screen.vignette = 0.3;
    s.crt.screen.brightness = 1.2;
  }),
  builtIn('glitchedText', 'Glitched Text', (s) => {
    // Demonstrates reordering: the ASCII image is torn and shifted afterwards.
    s.order = ['ascii', 'glitch', 'dither'];
    s.ascii.isEnabled = true;
    s.ascii.presetID = 'shades';
    s.ascii.foreground = rgb(0.4, 0.9, 1);
    s.glitch.isEnabled = true;
    s.glitch.tearing.isEnabled = true;
    s.glitch.channelShift.isEnabled = true;
  }),
];

// MARK: - Export / import files

/** A preset as it travels between machines: just a name and its settings. */
export interface PresetData {
  name: string;
  settings: RenderSettings;
}

const FILE_FORMAT = 'ascii-mosh/presets';
const FILE_VERSION = 1;
const MAX_NAME_LENGTH = 80;
const MAX_IMPORT = 500;

export const PRESET_FILE_EXTENSION = '.asciimosh.json';

function cleanName(value: unknown, fallback: string) {
  const name = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME_LENGTH) : '';
  return name || fallback;
}

/** A versioned JSON document holding one or more presets. */
export function encodePresetFile(presets: PresetData[]): string {
  return JSON.stringify(
    { format: FILE_FORMAT, version: FILE_VERSION, presets: presets.map((p) => ({ name: p.name, settings: p.settings })) },
    null,
    2,
  );
}

/**
 * Reads an exported file. Also accepts a bare preset (`{name, settings}`), a list of them, or a bare settings object,
 * so hand-written files work. Every value is type-checked against the defaults. Throws with a readable message.
 */
export function parsePresetFile(text: string): PresetData[] {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  const obj = doc && typeof doc === 'object' ? (doc as Record<string, unknown>) : null;
  if (obj?.format === FILE_FORMAT && typeof obj.version === 'number' && obj.version > FILE_VERSION) {
    throw new Error('These presets were saved by a newer version of ASCII Mosh.');
  }

  const looksLikeSettings = (v: unknown) =>
    !!v && typeof v === 'object' && ['adjust', 'glitch', 'dither', 'ascii', 'order'].some((k) => k in (v as object));
  const entries: unknown[] = Array.isArray(doc) ? doc : Array.isArray(obj?.presets) ? (obj.presets as unknown[]) : [doc];

  const presets = entries.slice(0, MAX_IMPORT).flatMap((entry, i): PresetData[] => {
    const e = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null;
    const raw = e && looksLikeSettings(e.settings) ? e.settings : looksLikeSettings(e) ? e : null;
    if (!raw) return [];
    return [{ name: cleanName(e?.name, entries.length > 1 ? `Imported ${i + 1}` : 'Imported preset'), settings: sanitizeSettings(raw) }];
  });
  if (!presets.length) throw new Error('The file does not contain any ASCII Mosh presets.');
  return presets;
}

// MARK: - Share links

// The preset rides in the URL fragment, which browsers never send to the server.
const SHARE_PARAM = 'preset';

function toBase64Url(text: string) {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(data: string) {
  const binary = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

/** A link to this app that applies `preset` when opened. Only settings that differ from the defaults are stored. */
export function shareLink(preset: PresetData, base = location.href): string {
  const payload = { v: FILE_VERSION, n: preset.name, s: diffFromDefaults(preset.settings, defaultSettings()) ?? {} };
  const url = new URL(base);
  url.hash = `${SHARE_PARAM}=${toBase64Url(JSON.stringify(payload))}`;
  return url.href;
}

/** The preset carried by a share link's fragment (`#preset=…`), or `null` if there is none or it is unreadable. */
export function readShareLink(hash: string): PresetData | null {
  const data = new URLSearchParams(hash.replace(/^#/, '')).get(SHARE_PARAM);
  if (!data || data.length > 20_000) return null;
  try {
    const payload = JSON.parse(fromBase64Url(data));
    if (!payload || typeof payload !== 'object') return null;
    return { name: cleanName(payload.n, 'Shared preset'), settings: sanitizeSettings(payload.s) };
  } catch {
    return null;
  }
}

/** Persists user presets as JSON in localStorage. */
export const PresetStorage = {
  key: 'asciimosh.savedPresets',

  load(): SavedPreset[] {
    try {
      const raw = JSON.parse(localStorage.getItem(this.key) ?? '[]');
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((p) => p && typeof p.name === 'string')
        .map((p) => ({ id: String(p.id ?? crypto.randomUUID()), name: p.name, settings: sanitizeSettings(p.settings) }));
    } catch {
      return [];
    }
  },

  save(presets: SavedPreset[]) {
    try {
      localStorage.setItem(this.key, JSON.stringify(presets));
    } catch {
      // Storage unavailable (private mode / quota): presets live for this session only.
    }
  },
};
