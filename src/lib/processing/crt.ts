import type { CrtSettings, PhosphorMaskSettings, ScanlineSettings } from '../model/settings';
import type { PixelBuffer } from './pixelbuffer';

/**
 * CRT look: optional barrel curvature, then scanlines, phosphor mask and vignette as per-pixel multipliers, with the
 * glow (a blur of the image before darkening) screen-blended back on top so light bleeds into the dark lines.
 */
export function applyCrt(b: PixelBuffer, s: CrtSettings, unit: number): PixelBuffer {
  const screen = s.screen.isEnabled ? s.screen : null;
  if (screen && screen.curvature > 0) b = curve(b, screen.curvature);

  const w = b.width, h = b.height, p = b.data;
  const glow = s.glow.isEnabled && s.glow.strength > 0 ? blurred(b, Math.max(1, Math.round(s.glow.radius * unit))) : null;
  const glowStrength = s.glow.strength;
  const lines = s.scanlines.isEnabled && s.scanlines.intensity > 0 ? scanlineProfile(s.scanlines, unit, s.scanlines.vertical ? w : h) : null;
  const vertical = s.scanlines.vertical;
  const mask = s.mask.isEnabled && s.mask.intensity > 0 ? maskSampler(s.mask, unit) : null;
  const brightness = screen ? screen.brightness : 1;
  const vignette = screen ? screen.vignette : 0;
  const rgb = [1, 1, 1];

  for (let y = 0; y < h; y++) {
    const v = (2 * y) / Math.max(1, h - 1) - 1;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      let m = brightness;
      if (lines) m *= lines[vertical ? x : y];
      let vig = 1;
      if (vignette > 0) {
        const u = (2 * x) / Math.max(1, w - 1) - 1;
        vig = 1 - vignette * ((u * u + v * v) / 2);
        m *= vig;
      }
      if (mask) mask(x, y, rgb);
      for (let c = 0; c < 3; c++) {
        let out = p[o + c] * m * (mask ? rgb[c] : 1);
        if (glow) {
          // Screen blend keeps highlights from clipping as hard as plain addition would.
          const g = glow[o + c] * glowStrength * vig;
          out = out + g - (out * g) / 255;
        }
        p[o + c] = out;
      }
    }
  }
  return b;
}

// MARK: Scanlines

/** Brightness multiplier for every row (or column): a dark band per period, with feathered edges. */
function scanlineProfile(s: ScanlineSettings, unit: number, length: number): Float32Array {
  const period = Math.max(1.5, s.spacing * unit);
  const half = s.thickness / 2;
  // At least half a pixel of feather keeps fine scanlines from aliasing into moiré.
  const feather = Math.max(0.5 / period, s.softness * Math.min(half, 0.5 - half));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = ((i + 0.5) / period + s.offset) % 1;
    const d = Math.abs(t - 0.5); // distance from the band centre, 0…0.5
    const dark = 1 - smoothstep(half - feather, half + feather, d);
    out[i] = 1 - s.intensity * dark;
  }
  return out;
}

const smoothstep = (a: number, b: number, x: number) => {
  if (b <= a) return x < a ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// MARK: Phosphor mask

/**
 * Writes per-channel multipliers for pixel (x, y) into `out`. The lit phosphor is boosted and the other two dimmed, so
 * the mask tints at close range but costs only a third of `intensity` in average brightness.
 */
function maskSampler(s: PhosphorMaskSettings, unit: number): (x: number, y: number, out: number[]) => void {
  const triad = Math.max(2, s.size * unit);
  const stripe = triad / 3;
  const lit = 1 + s.intensity, dim = 1 - s.intensity;
  const gap = Math.max(1, triad * 0.25);
  return (x, y, out) => {
    let shift = 0;
    if (s.type === 'shadowMask') shift = Math.floor(y / (triad / 2)) % 2 ? triad / 2 : 0; // staggered dot rows
    const channel = Math.floor((x + shift) / stripe) % 3;
    out[0] = out[1] = out[2] = dim;
    out[channel] = lit;
    if (s.type === 'slotMask') {
      // Horizontal breaks between slots, staggered from one triad column to the next.
      const column = Math.floor(x / triad);
      if ((y + (column % 2) * triad) % (triad * 2) < gap) out[0] = out[1] = out[2] = dim;
    }
  };
}

// MARK: Glow

/** Approximate Gaussian blur: two separable box-blur passes each way, using running sums. */
function blurred(b: PixelBuffer, radius: number): Uint8ClampedArray {
  const w = b.width, h = b.height;
  let src = b.data.slice();
  let tmp = new Uint8ClampedArray(src.length);
  for (let pass = 0; pass < 2; pass++) {
    boxBlur(src, tmp, w, h, radius, 4, w * 4); // horizontal
    boxBlur(tmp, src, h, w, radius, w * 4, 4); // vertical
  }
  return src;
}

/** One box-blur pass over `lines` lines of `count` pixels; `step` moves along a line, `stride` to the next line. */
function boxBlur(src: Uint8ClampedArray, dst: Uint8ClampedArray, count: number, lines: number, r: number, step: number, stride: number) {
  const size = 2 * r + 1;
  for (let line = 0; line < lines; line++) {
    const base = line * stride;
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += src[base + Math.min(count - 1, Math.max(0, i)) * step + c];
      for (let i = 0; i < count; i++) {
        dst[base + i * step + c] = sum / size;
        const add = Math.min(count - 1, i + r + 1), drop = Math.max(0, i - r);
        sum += src[base + add * step + c] - src[base + drop * step + c];
      }
    }
    for (let i = 0; i < count; i++) dst[base + i * step + 3] = 255;
  }
}

// MARK: Curvature

/** Barrel distortion like a curved tube; areas that fall outside the picture become the black bezel. */
function curve(b: PixelBuffer, k: number): PixelBuffer {
  const w = b.width, h = b.height, src = b.data;
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) {
    const v = (2 * y) / (h - 1 || 1) - 1;
    for (let x = 0; x < w; x++) {
      const u = (2 * x) / (w - 1 || 1) - 1;
      const f = 1 + k * (u * u + v * v);
      const sx = ((u * f + 1) / 2) * (w - 1), sy = ((v * f + 1) / 2) * (h - 1);
      const o = (y * w + x) * 4;
      out[o + 3] = 255;
      if (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1) continue;
      // Bilinear sampling keeps straight edges from turning into stair steps.
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
      const fx = sx - x0, fy = sy - y0;
      const a = (y0 * w + x0) * 4, bb = (y0 * w + x1) * 4, c = (y1 * w + x0) * 4, d = (y1 * w + x1) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const top = src[a + ch] + (src[bb + ch] - src[a + ch]) * fx;
        const bottom = src[c + ch] + (src[d + ch] - src[c + ch]) * fx;
        out[o + ch] = top + (bottom - top) * fy;
      }
    }
  }
  return { width: w, height: h, data: out };
}
