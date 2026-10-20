// All settings are plain JSON-able objects so a snapshot can be posted to the render worker.

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export const rgb = (r: number, g: number, b: number): RGBColor => ({ r, g, b });
export const BLACK = (): RGBColor => rgb(0, 0, 0);
export const WHITE = (): RGBColor => rgb(1, 1, 1);

export function hexColor(hex: number): RGBColor {
  return rgb(((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255);
}
export const luminance = (c: RGBColor) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;

export function toHex(c: RGBColor): string {
  const h = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}
export function fromHex(s: string): RGBColor {
  return hexColor(parseInt(s.replace('#', ''), 16) || 0);
}

type Titled<T extends string> = readonly { id: T; title: string }[];

// MARK: - Stages

/** The movable stages. Adjust always runs first and is not part of the order. */
export type EffectStage = 'glitch' | 'dither' | 'ascii';
export const EFFECT_STAGES: EffectStage[] = ['glitch', 'dither', 'ascii'];
export const STAGE_TITLES: Record<EffectStage, string> = { glitch: 'Glitch', dither: 'Dither', ascii: 'ASCII' };

// MARK: - Adjust

export interface AdjustSettings {
  isEnabled: boolean;
  brightness: number; // -1...1
  contrast: number; // 0...3
  gamma: number; // 0.2...3
  saturation: number; // 0...2
  hue: number; // -180...180 degrees
  invert: boolean;
}
export const defaultAdjust = (): AdjustSettings => ({
  isEnabled: true, brightness: 0, contrast: 1, gamma: 1, saturation: 1, hue: 0, invert: false,
});

// MARK: - ASCII

export type AsciiColorMode = 'mono' | 'original' | 'originalBlocks';
export const ASCII_COLOR_MODES: Titled<AsciiColorMode> = [
  { id: 'mono', title: 'Two colors' },
  { id: 'original', title: 'Image colors' },
  { id: 'originalBlocks', title: 'Image colors + cell fill' },
];

export interface AsciiSettings {
  isEnabled: boolean;
  presetID: string;
  customCharacters: string;
  columns: number; // 10...400
  lineSpacing: number; // 0.7...1.6
  invert: boolean;
  sortByDensity: boolean;
  toneMatch: boolean;
  colorMode: AsciiColorMode;
  foreground: RGBColor;
  background: RGBColor;
}
export const defaultAscii = (): AsciiSettings => ({
  isEnabled: false, presetID: 'standard', customCharacters: ' .·:░▒▓█', columns: 120, lineSpacing: 1,
  invert: false, sortByDensity: true, toneMatch: true, colorMode: 'mono', foreground: WHITE(), background: BLACK(),
});

// MARK: - Dither

export type DitherAlgorithm =
  | 'floydSteinberg' | 'atkinson' | 'jarvis' | 'stucki' | 'burkes' | 'sierra' | 'sierraTwoRow' | 'sierraLite'
  | 'bayer2' | 'bayer4' | 'bayer8' | 'clusteredDot' | 'blueNoise' | 'whiteNoise' | 'threshold';

export const DITHER_ALGORITHMS: Titled<DitherAlgorithm> = [
  { id: 'floydSteinberg', title: 'Floyd–Steinberg' },
  { id: 'atkinson', title: 'Atkinson' },
  { id: 'jarvis', title: 'Jarvis–Judice–Ninke' },
  { id: 'stucki', title: 'Stucki' },
  { id: 'burkes', title: 'Burkes' },
  { id: 'sierra', title: 'Sierra' },
  { id: 'sierraTwoRow', title: 'Sierra Two-Row' },
  { id: 'sierraLite', title: 'Sierra Lite' },
  { id: 'bayer2', title: 'Bayer 2×2 (ordered)' },
  { id: 'bayer4', title: 'Bayer 4×4 (ordered)' },
  { id: 'bayer8', title: 'Bayer 8×8 (ordered)' },
  { id: 'clusteredDot', title: 'Clustered dot (halftone)' },
  { id: 'blueNoise', title: 'Blue noise' },
  { id: 'whiteNoise', title: 'White noise' },
  { id: 'threshold', title: 'Threshold (none)' },
];
const ERROR_DIFFUSION = new Set<DitherAlgorithm>([
  'floydSteinberg', 'atkinson', 'jarvis', 'stucki', 'burkes', 'sierra', 'sierraTwoRow', 'sierraLite',
]);
export const isErrorDiffusion = (a: DitherAlgorithm) => ERROR_DIFFUSION.has(a);

export type DitherColorMode = 'mono' | 'palette' | 'rgbLevels' | 'autoPalette';
export const DITHER_COLOR_MODES: Titled<DitherColorMode> = [
  { id: 'mono', title: 'Monochrome (2 colors)' },
  { id: 'palette', title: 'Retro palette' },
  { id: 'rgbLevels', title: 'RGB levels per channel' },
  { id: 'autoPalette', title: 'Adaptive palette' },
];

export type DitherPalette = 'gameBoy' | 'cga' | 'ega' | 'c64' | 'pico8' | 'mac16' | 'zxSpectrum' | 'teletext' | 'gray4';
export const DITHER_PALETTES: readonly { id: DitherPalette; title: string; hex: number[] }[] = [
  { id: 'gameBoy', title: 'Game Boy (4)', hex: [0x0f380f, 0x306230, 0x8bac0f, 0x9bbc0f] },
  { id: 'cga', title: 'CGA Mode 4 (4)', hex: [0x000000, 0x55ffff, 0xff55ff, 0xffffff] },
  { id: 'ega', title: 'EGA (16)', hex: [0x000000, 0x0000aa, 0x00aa00, 0x00aaaa, 0xaa0000, 0xaa00aa, 0xaa5500, 0xaaaaaa,
    0x555555, 0x5555ff, 0x55ff55, 0x55ffff, 0xff5555, 0xff55ff, 0xffff55, 0xffffff] },
  { id: 'c64', title: 'Commodore 64 (16)', hex: [0x000000, 0xffffff, 0x880000, 0xaaffee, 0xcc44cc, 0x00cc55, 0x0000aa, 0xeeee77,
    0xdd8855, 0x664400, 0xff7777, 0x333333, 0x777777, 0xaaff66, 0x0088ff, 0xbbbbbb] },
  { id: 'pico8', title: 'PICO-8 (16)', hex: [0x000000, 0x1d2b53, 0x7e2553, 0x008751, 0xab5236, 0x5f574f, 0xc2c3c7, 0xfff1e8,
    0xff004d, 0xffa300, 0xffec27, 0x00e436, 0x29adff, 0x83769c, 0xff77a8, 0xffccaa] },
  { id: 'mac16', title: 'Macintosh II (16)', hex: [0xffffff, 0xffff00, 0xff6500, 0xdc0000, 0xff0097, 0x360097, 0x0000ca, 0x0097ff,
    0x00a800, 0x006500, 0x653600, 0x976536, 0xb9b9b9, 0x868686, 0x454545, 0x000000] },
  { id: 'zxSpectrum', title: 'ZX Spectrum (15)', hex: [0x000000, 0x0000d7, 0xd70000, 0xd700d7, 0x00d700, 0x00d7d7, 0xd7d700, 0xd7d7d7,
    0x0000ff, 0xff0000, 0xff00ff, 0x00ff00, 0x00ffff, 0xffff00, 0xffffff] },
  { id: 'teletext', title: 'Teletext RGB/CMY (8)', hex: [0x000000, 0xff0000, 0x00ff00, 0xffff00, 0x0000ff, 0xff00ff, 0x00ffff, 0xffffff] },
  { id: 'gray4', title: 'Grayscale (4)', hex: [0x000000, 0x555555, 0xaaaaaa, 0xffffff] },
];
export const paletteColors = (p: DitherPalette): RGBColor[] =>
  (DITHER_PALETTES.find((x) => x.id === p) ?? DITHER_PALETTES[0]).hex.map(hexColor);

export interface DitherSettings {
  isEnabled: boolean;
  algorithm: DitherAlgorithm;
  colorMode: DitherColorMode;
  palette: DitherPalette;
  levels: number; // 2...8 per channel
  autoColors: number; // 2...32
  pixelScale: number; // 1...16
  strength: number; // 0...1.5
  serpentine: boolean;
  threshold: number; // 0...1 (mono)
  dark: RGBColor;
  light: RGBColor;
}
export const defaultDither = (): DitherSettings => ({
  isEnabled: false, algorithm: 'floydSteinberg', colorMode: 'mono', palette: 'gameBoy', levels: 2, autoColors: 8,
  pixelScale: 2, strength: 1, serpentine: true, threshold: 0.5, dark: BLACK(), light: WHITE(),
});

// MARK: - Glitch / datamosh

export type SlitScanMode = 'wave' | 'stretch' | 'timeShift';
export const SLIT_SCAN_MODES: Titled<SlitScanMode> = [
  { id: 'wave', title: 'Wave' },
  { id: 'stretch', title: 'Slit stretch' },
  { id: 'timeShift', title: 'Time shift (rolling shutter)' },
];

export type DisplacementSource = 'luminance' | 'red' | 'noise';
export const DISPLACEMENT_SOURCES: Titled<DisplacementSource> = [
  { id: 'luminance', title: 'Image luminance' },
  { id: 'red', title: 'Red channel' },
  { id: 'noise', title: 'Smooth noise' },
];

export type DatabendMode = 'shift' | 'corrupt' | 'both';
export const DATABEND_MODES: Titled<DatabendMode> = [
  { id: 'shift', title: 'Byte shift' },
  { id: 'corrupt', title: 'Byte corruption' },
  { id: 'both', title: 'Both' },
];

export const defaultGlitch = () => ({
  isEnabled: false,
  seed: 1,
  slitScan: { isEnabled: false, mode: 'wave' as SlitScanMode, vertical: false, amount: 0.08, frequency: 3, position: 0.5 },
  displacement: { isEnabled: false, source: 'luminance' as DisplacementSource, strengthX: 0.05, strengthY: 0, noiseScale: 0.08 },
  quant: { isEnabled: false, quality: 25, blockScale: 1, scramble: 0, mismatch: 0, corruption: 0, dcDrift: 0 },
  chroma: { isEnabled: false, horizontal: 4, vertical: 2, offsetX: 0, offsetY: 0, boost: 1 },
  macroblock: { isEnabled: false, blockSize: 16, probability: 0.15, motionX: 0.02, motionY: 0.01, randomMotion: 0.5, smear: true, iterations: 2 },
  pixelSort: { isEnabled: false, vertical: false, lower: 0.25, upper: 0.8, reverse: false },
  rowShift: { isEnabled: false, vertical: false, probability: 0.3, maxShift: 0.15, minBand: 2, maxBand: 30 },
  tearing: { isEnabled: false, tears: 8, maxHeight: 0.08, maxOffset: 0.15, rgbSplit: 0.01, stuckLines: 0.3 },
  channelShift: { isEnabled: false, redX: 0.01, redY: 0, blueX: -0.01, blueY: 0 },
  databend: { isEnabled: false, mode: 'shift' as DatabendMode, glitches: 6, chunkSize: 0.02, intensity: 0.3 },
});
export type GlitchSettings = ReturnType<typeof defaultGlitch>;
export type SlitScanSettings = GlitchSettings['slitScan'];
export type DisplacementSettings = GlitchSettings['displacement'];
export type QuantSettings = GlitchSettings['quant'];
export type ChromaSettings = GlitchSettings['chroma'];
export type MacroblockSettings = GlitchSettings['macroblock'];
export type PixelSortSettings = GlitchSettings['pixelSort'];
export type RowShiftSettings = GlitchSettings['rowShift'];
export type TearingSettings = GlitchSettings['tearing'];
export type ChannelShiftSettings = GlitchSettings['channelShift'];
export type DatabendSettings = GlitchSettings['databend'];

// MARK: - Render settings

export interface RenderSettings {
  order: EffectStage[];
  adjust: AdjustSettings;
  glitch: GlitchSettings;
  dither: DitherSettings;
  ascii: AsciiSettings;
}
export const defaultSettings = (): RenderSettings => ({
  order: ['glitch', 'dither', 'ascii'],
  adjust: defaultAdjust(),
  glitch: defaultGlitch(),
  dither: defaultDither(),
  ascii: defaultAscii(),
});

/** `order` with duplicates removed and any missing stage appended, so a damaged preset still renders. */
export function normalizedOrder(order: readonly string[]): EffectStage[] {
  const seen = new Set<EffectStage>();
  for (const s of order) if ((EFFECT_STAGES as string[]).includes(s)) seen.add(s as EffectStage);
  return [...seen, ...EFFECT_STAGES.filter((s) => !seen.has(s))];
}

/** Deep-merges `value` onto `defaults`: missing or mistyped keys fall back, so old presets still load. */
export function mergeDefaults<T>(defaults: T, value: unknown): T {
  if (Array.isArray(defaults)) return (Array.isArray(value) ? value : defaults) as T;
  if (defaults && typeof defaults === 'object') {
    const out: Record<string, unknown> = {};
    const v = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    for (const [k, d] of Object.entries(defaults)) out[k] = mergeDefaults(d, v[k]);
    return out as T;
  }
  return (typeof value === typeof defaults ? value : defaults) as T;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}
