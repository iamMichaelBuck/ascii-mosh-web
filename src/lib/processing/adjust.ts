import type { AdjustSettings } from '../model/settings';
import type { PixelBuffer } from './pixelbuffer';

export function applyAdjust(buffer: PixelBuffer, s: AdjustSettings) {
  const isIdentity = s.brightness === 0 && s.contrast === 1 && s.gamma === 1 && s.saturation === 1 && s.hue === 0 && !s.invert;
  if (isIdentity) return;

  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    let v = i / 255 + s.brightness;
    v = (v - 0.5) * s.contrast + 0.5;
    v = Math.pow(Math.max(0, Math.min(1, v)), 1 / Math.max(0.01, s.gamma));
    if (s.invert) v = 1 - v;
    lut[i] = v * 255;
  }

  const p = buffer.data;
  const n = buffer.width * buffer.height * 4;
  if (s.hue === 0 && s.saturation === 1) {
    for (let o = 0; o < n; o += 4) {
      p[o] = lut[p[o]];
      p[o + 1] = lut[p[o + 1]];
      p[o + 2] = lut[p[o + 2]];
    }
    return;
  }
  // Hue rotation (luminance-preserving, as in CSS hue-rotate) and saturation merged into one 3×3 matrix.
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = hueSaturationMatrix(s.hue, s.saturation);
  for (let o = 0; o < n; o += 4) {
    const r = lut[p[o]], g = lut[p[o + 1]], b = lut[p[o + 2]];
    p[o] = m0 * r + m1 * g + m2 * b;
    p[o + 1] = m3 * r + m4 * g + m5 * b;
    p[o + 2] = m6 * r + m7 * g + m8 * b;
  }
}

/** Row-major 3×3 matrix: saturation applied after hue rotation. */
function hueSaturationMatrix(hue: number, saturation: number): number[] {
  const a = (hue * Math.PI) / 180;
  const c = Math.cos(a), sn = Math.sin(a);
  const h = [
    0.213 + c * 0.787 - sn * 0.213, 0.715 - c * 0.715 - sn * 0.715, 0.072 - c * 0.072 + sn * 0.928,
    0.213 - c * 0.213 + sn * 0.143, 0.715 + c * 0.285 + sn * 0.14, 0.072 - c * 0.072 - sn * 0.283,
    0.213 - c * 0.213 - sn * 0.787, 0.715 - c * 0.715 + sn * 0.715, 0.072 + c * 0.928 + sn * 0.072,
  ];
  const sat = saturation, lr = 0.299, lg = 0.587, lb = 0.114;
  const sm = [
    lr + (1 - lr) * sat, lg - lg * sat, lb - lb * sat,
    lr - lr * sat, lg + (1 - lg) * sat, lb - lb * sat,
    lr - lr * sat, lg - lg * sat, lb + (1 - lb) * sat,
  ];
  const m = new Array<number>(9).fill(0);
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++)
      for (let k = 0; k < 3; k++) m[row * 3 + col] += sm[row * 3 + k] * h[k * 3 + col];
  return m;
}
