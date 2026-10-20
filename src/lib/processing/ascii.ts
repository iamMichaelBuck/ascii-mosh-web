import { asciiPreset, CUSTOM_PRESET_ID } from '../model/charsets';
import { luminance, type AsciiSettings } from '../model/settings';
import type { PixelBuffer } from './pixelbuffer';

export interface AsciiOutput {
  canvas: OffscreenCanvas;
  text: string;
}

const FONT_STACK = 'Menlo, Monaco, "SF Mono", "DejaVu Sans Mono", "Cascadia Mono", Consolas, "Liberation Mono", monospace';
const font = (size: number) => `${size}px ${FONT_STACK}`;

interface Metrics { advance: number; ascent: number; descent: number }
let metricsCache: Metrics | null = null;

/** Advance, ascent and descent as fractions of the font size. */
function metrics(): Metrics {
  if (metricsCache) return metricsCache;
  const ctx = new OffscreenCanvas(8, 8).getContext('2d')!;
  ctx.font = font(100);
  const m = ctx.measureText('M');
  metricsCache = {
    advance: (m.width || 60) / 100,
    ascent: (m.fontBoundingBoxAscent || 93) / 100,
    descent: (m.fontBoundingBoxDescent || 24) / 100,
  };
  return metricsCache;
}

/** Ink extent (fractions of the font size) of block-element glyphs (U+2580–U+259F). Menlo draws shades
 *  like ░▒▓ shorter than the line box; stretching them to the cell keeps rows from showing gaps. */
const blockInkCache = new Map<string, { ascent: number; descent: number } | null>();

function blockInk(c: string): { ascent: number; descent: number } | null {
  let hit = blockInkCache.get(c);
  if (hit !== undefined) return hit;
  const code = c.codePointAt(0)!;
  hit = null;
  if (code >= 0x2580 && code <= 0x259f) {
    const ctx = new OffscreenCanvas(8, 8).getContext('2d')!;
    ctx.font = font(100);
    const m = ctx.measureText(c);
    const ascent = m.actualBoundingBoxAscent / 100, descent = m.actualBoundingBoxDescent / 100;
    if (ascent + descent > 0.1) hit = { ascent, descent };
  }
  blockInkCache.set(c, hit);
  return hit;
}

/** Fraction of a glyph cell covered by ink, measured by rasterising the glyph (cached per character). */
const coverageCache = new Map<string, number>();
let coverageCtx: OffscreenCanvasRenderingContext2D | null = null;

function coverage(c: string): number {
  if (c === ' ') return 0;
  if (c === '█') return 1;
  const hit = coverageCache.get(c);
  if (hit !== undefined) return hit;
  const size = 32, m = metrics();
  const cw = Math.ceil(m.advance * size) + 2;
  const ch = Math.ceil((m.ascent + m.descent) * size);
  if (!coverageCtx) coverageCtx = new OffscreenCanvas(cw, ch).getContext('2d', { willReadFrequently: true })!;
  const ctx = coverageCtx;
  ctx.clearRect(0, 0, cw, ch);
  ctx.font = font(size);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(c, 1, m.ascent * size);
  const data = ctx.getImageData(0, 0, cw, ch).data;
  let sum = 0;
  for (let i = 3; i < data.length; i += 4) sum += data[i];
  const v = sum / (cw * ch * 255);
  coverageCache.set(c, v);
  return v;
}

const css = (r: number, g: number, b: number) =>
  `rgb(${Math.round(Math.min(1, r) * 255)} ${Math.round(Math.min(1, g) * 255)} ${Math.round(Math.min(1, b) * 255)})`;

export function renderAscii(buffer: PixelBuffer, s: AsciiSettings): AsciiOutput {
  const preset = asciiPreset(s.presetID);
  const m = metrics();
  const w = buffer.width, h = buffer.height, d = buffer.data;

  const columns = Math.max(1, Math.min(Math.round(s.columns), w));
  const cellW = w / columns;
  const fontSize = cellW / m.advance;
  const glyphBox = fontSize * (m.ascent + m.descent);
  const cellH = glyphBox * s.lineSpacing;
  const rows = Math.max(1, Math.trunc(h / cellH));

  // Background decides the mapping direction: dense characters represent whatever contrasts with it.
  const darkBackground = s.colorMode !== 'mono' || luminance(s.background) < luminance(s.foreground);
  const invert = s.invert !== !darkBackground; // XOR
  const tone = (l: number) => (invert ? 1 - l : l);

  // Ramp setup.
  let ramp: string[] = [];
  const lut = new Int32Array(256);
  if (preset.mode === 'ramp') {
    const source = preset.id === CUSTOM_PRESET_ID ? s.customCharacters : preset.characters;
    ramp = [...new Set([...source].filter((c) => c !== '\n' && c !== '\t' && c !== '\r'))];
    if (!ramp.length) ramp = [' ', '#'];
    let cov = ramp.map(coverage);
    if (s.sortByDensity) {
      const order = cov.map((_, i) => i).sort((a, b) => cov[a] - cov[b]);
      ramp = order.map((i) => ramp[i]);
      cov = order.map((i) => cov[i]);
    }
    const lo = Math.min(...cov), hi = Math.max(Math.max(...cov), lo + 0.0001);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      if (s.toneMatch && s.sortByDensity) {
        // Pick the character whose ink coverage is closest to the requested tone.
        let best = 0, bestD = Infinity;
        cov.forEach((c, k) => {
          const dd = Math.abs((c - lo) / (hi - lo) - t);
          if (dd < bestD) { bestD = dd; best = k; }
        });
        lut[i] = best;
      } else {
        lut[i] = Math.min(ramp.length - 1, Math.trunc(t * ramp.length));
      }
    }
  }

  // Sample cells. `avg` receives the 0...1 average colour of the box.
  const avg = new Float32Array(3);
  const average = (x0: number, x1: number, y0: number, y1: number) => {
    const xs = Math.max(x0, 0), xe = Math.min(Math.max(x1, xs + 1), w);
    const ys = Math.max(y0, 0), ye = Math.min(Math.max(y1, ys + 1), h);
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = ys; y < ye; y++) {
      for (let o = (y * w + xs) * 4, end = (y * w + xe) * 4; o < end; o += 4) {
        r += d[o]; g += d[o + 1]; b += d[o + 2];
      }
      n += xe - xs;
    }
    const k = n > 0 ? 1 / (n * 255) : 0;
    avg[0] = r * k; avg[1] = g * k; avg[2] = b * k;
  };
  const avgLum = () => 0.299 * avg[0] + 0.587 * avg[1] + 0.114 * avg[2];

  const count = rows * columns;
  const chars = new Array<string>(count);
  const colors = new Float32Array(count * 3);
  const sub = preset.mode === 'halfBlocks' ? new Float32Array(count * 6) : null; // top rgb, bottom rgb
  const BRAILLE_BITS = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]];

  for (let r = 0; r < rows; r++) {
    const y0 = Math.trunc(r * cellH), y1 = Math.trunc((r + 1) * cellH);
    for (let c = 0; c < columns; c++) {
      const x0 = Math.trunc(c * cellW), x1 = Math.trunc((c + 1) * cellW);
      const i = r * columns + c;
      average(x0, x1, y0, y1);
      colors[i * 3] = avg[0]; colors[i * 3 + 1] = avg[1]; colors[i * 3 + 2] = avg[2];
      if (preset.mode === 'ramp') {
        const v = tone(avgLum());
        chars[i] = ramp[lut[Math.max(0, Math.min(255, Math.trunc(v * 255)))]];
      } else if (preset.mode === 'halfBlocks') {
        const ym = (y0 + y1) >> 1;
        average(x0, x1, y0, ym);
        const t = tone(avgLum()) > 0.5;
        sub![i * 6] = avg[0]; sub![i * 6 + 1] = avg[1]; sub![i * 6 + 2] = avg[2];
        average(x0, x1, ym, y1);
        const b = tone(avgLum()) > 0.5;
        sub![i * 6 + 3] = avg[0]; sub![i * 6 + 4] = avg[1]; sub![i * 6 + 5] = avg[2];
        chars[i] = t && b ? '█' : t ? '▀' : b ? '▄' : ' ';
      } else {
        // Dot bit layout of U+2800: columns of 1,2,3,7 and 4,5,6,8.
        let code = 0;
        const sw = (x1 - x0) / 2, sh = (y1 - y0) / 4;
        for (let sy = 0; sy < 4; sy++)
          for (let sx = 0; sx < 2; sx++) {
            average(x0 + Math.trunc(sx * sw), x0 + Math.trunc((sx + 1) * sw), y0 + Math.trunc(sy * sh), y0 + Math.trunc((sy + 1) * sh));
            if (tone(avgLum()) > 0.5) code |= BRAILLE_BITS[sy][sx];
          }
        chars[i] = String.fromCharCode(0x2800 + code);
      }
    }
  }

  // Text output.
  const lines = new Array<string>(rows);
  for (let r = 0; r < rows; r++) lines[r] = chars.slice(r * columns, (r + 1) * columns).join('');
  const text = lines.join('\n') + '\n';

  // Image output.
  const outW = w, outH = Math.max(1, Math.round(rows * cellH));
  const canvas = new OffscreenCanvas(outW, outH);
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const bg = s.background, fg = s.foreground;
  ctx.fillStyle = css(bg.r, bg.g, bg.b);
  ctx.fillRect(0, 0, outW, outH);
  ctx.font = font(fontSize);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const baseline = (cellH - glyphBox) / 2 + fontSize * m.ascent;
  const mono = s.colorMode === 'mono', blocks = s.colorMode === 'originalBlocks';
  if (mono) ctx.fillStyle = css(fg.r, fg.g, fg.b);

  for (let r = 0; r < rows; r++) {
    const cy = r * cellH;
    for (let c = 0; c < columns; c++) {
      const i = r * columns + c;
      const cx = c * cellW;
      const cr = colors[i * 3], cg = colors[i * 3 + 1], cb = colors[i * 3 + 2];

      if (blocks) {
        ctx.fillStyle = css(cr * 0.35, cg * 0.35, cb * 0.35);
        ctx.fillRect(cx - 0.5, cy - 0.5, cellW + 1, cellH + 1);
      }

      // Half blocks in color: true-color "▀" with the bottom color as cell background.
      if (sub && !mono) {
        ctx.fillStyle = css(sub[i * 6 + 3], sub[i * 6 + 4], sub[i * 6 + 5]);
        ctx.fillRect(cx - 0.5, cy - 0.5, cellW + 1, cellH + 1);
        ctx.fillStyle = css(sub[i * 6], sub[i * 6 + 1], sub[i * 6 + 2]);
        ctx.fillRect(cx - 0.5, cy - 0.25, cellW + 1, cellH / 2 + 0.5);
        continue;
      }

      const ch = chars[i];
      if (ch === ' ' || ch === '⠀') continue;
      if (!mono) ctx.fillStyle = blocks ? css(cr * 1.35, cg * 1.35, cb * 1.35) : css(cr, cg, cb);

      // Solid block characters are drawn as rects so neighbouring cells join seamlessly.
      if (fillBlock(ctx, ch, cx, cy, cellW, cellH)) continue;
      const ink = blockInk(ch);
      if (ink) {
        const sy = (cellH + 0.5) / ((ink.ascent + ink.descent) * fontSize);
        ctx.setTransform(1, 0, 0, sy, cx + cellW / 2, cy - 0.25 + ink.ascent * fontSize * sy);
        ctx.fillText(ch, 0, 0);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        continue;
      }
      ctx.fillText(ch, cx + cellW / 2, cy + baseline);
    }
  }
  return { canvas, text };
}

function fillBlock(ctx: OffscreenCanvasRenderingContext2D, c: string, x: number, y: number, w: number, h: number): boolean {
  const e = 0.25;
  switch (c) {
    case '█': ctx.fillRect(x - e, y - e, w + 2 * e, h + 2 * e); return true;
    case '▀': ctx.fillRect(x - e, y - e, w + 2 * e, h / 2 + e); return true;
    case '▄': ctx.fillRect(x - e, y + h / 2, w + 2 * e, h / 2 + e); return true;
    case '▌': ctx.fillRect(x - e, y - e, w / 2 + e, h + 2 * e); return true;
    case '▐': ctx.fillRect(x + w / 2, y - e, w / 2 + e, h + 2 * e); return true;
    default: return false;
  }
}
