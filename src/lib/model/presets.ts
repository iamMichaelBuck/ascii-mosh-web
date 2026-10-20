import { defaultSettings, mergeDefaults, rgb, type RenderSettings } from './settings';

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

/** Persists user presets as JSON in localStorage. */
export const PresetStorage = {
  key: 'asciimosh.savedPresets',

  load(): SavedPreset[] {
    try {
      const raw = JSON.parse(localStorage.getItem(this.key) ?? '[]');
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((p) => p && typeof p.name === 'string')
        .map((p) => ({ id: String(p.id ?? crypto.randomUUID()), name: p.name, settings: mergeDefaults(defaultSettings(), p.settings) }));
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
