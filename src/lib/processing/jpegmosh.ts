import type { ChromaSettings, QuantSettings } from '../model/settings';
import { resized, SeededRandom, wrap, type PixelBuffer } from './pixelbuffer';

// A tiny JPEG-like codec (YCbCr, 8×8 DCT, quantization) built to be abused:
// broken quantization tables, mismatched dequantization, coefficient corruption,
// DC drift and exaggerated chroma subsampling.

// Standard JPEG tables (ITU T.81 Annex K).
const LUMA_TABLE = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];
const CHROMA_TABLE = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99,
  24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
  ...new Array<number>(32).fill(99),
];

/** COS[u * 8 + x] = C(u)/2 · cos((2x+1)uπ/16) */
const COS = (() => {
  const t = new Float32Array(64);
  for (let u = 0; u < 8; u++) {
    const c = u === 0 ? 1 / Math.SQRT2 : 1;
    for (let x = 0; x < 8; x++) t[u * 8 + x] = (c / 2) * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  }
  return t;
})();

// MARK: - Color planes

interface Planes { w: number; h: number; y: Float32Array; cb: Float32Array; cr: Float32Array }

function toPlanes(b: PixelBuffer): Planes {
  const n = b.width * b.height, d = b.data;
  const y = new Float32Array(n), cb = new Float32Array(n), cr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], bl = d[i * 4 + 2];
    y[i] = 0.299 * r + 0.587 * g + 0.114 * bl;
    cb[i] = -0.168736 * r - 0.331264 * g + 0.5 * bl + 128;
    cr[i] = 0.5 * r - 0.418688 * g - 0.081312 * bl + 128;
  }
  return { w: b.width, h: b.height, y, cb, cr };
}

function fromPlanes(p: Planes, b: PixelBuffer) {
  const d = b.data, n = p.w * p.h;
  for (let i = 0; i < n; i++) {
    const y = p.y[i], cb = p.cb[i] - 128, cr = p.cr[i] - 128;
    d[i * 4] = y + 1.402 * cr;
    d[i * 4 + 1] = y - 0.344136 * cb - 0.714136 * cr;
    d[i * 4 + 2] = y + 1.772 * cb;
    d[i * 4 + 3] = 255;
  }
}

// MARK: - Chroma subsampling

export function chromaSubsample(b: PixelBuffer, s: ChromaSettings, unit: number) {
  const p = toPlanes(b);
  const fx = Math.max(1, Math.round(s.horizontal * Math.max(unit, 0.25)));
  const fy = Math.max(1, Math.round(s.vertical * Math.max(unit, 0.25)));
  const ox = Math.trunc(s.offsetX * p.w), oy = Math.trunc(s.offsetY * p.h);
  p.cb = subsample(p.cb, p.w, p.h, fx, fy, ox, oy, s.boost);
  p.cr = subsample(p.cr, p.w, p.h, fx, fy, ox, oy, s.boost);
  fromPlanes(p, b);
}

/** Averages each fx×fy block, then upsamples with nearest neighbour (shifted by the offset). */
function subsample(plane: Float32Array, w: number, h: number, fx: number, fy: number, ox: number, oy: number, boost: number) {
  const sw = Math.ceil(w / fx), sh = Math.ceil(h / fy);
  const small = new Float32Array(sw * sh), counts = new Float32Array(sw * sh);
  const col = new Int32Array(w), shifted = new Int32Array(w);
  for (let x = 0; x < w; x++) {
    col[x] = Math.trunc(x / fx);
    shifted[x] = Math.trunc(wrap(x - ox, w) / fx);
  }
  for (let y = 0; y < h; y++) {
    const row = Math.trunc(y / fy) * sw, o = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + col[x];
      small[i] += plane[o + x];
      counts[i]++;
    }
  }
  for (let i = 0; i < small.length; i++) if (counts[i] > 0) small[i] = 128 + (small[i] / counts[i] - 128) * boost;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = Math.trunc(wrap(y - oy, h) / fy) * sw, o = y * w;
    for (let x = 0; x < w; x++) out[o + x] = small[row + shifted[x]];
  }
  return out;
}

// MARK: - Quantization abuse

export function quantize(b: PixelBuffer, s: QuantSettings, seed: number, unit: number): PixelBuffer {
  const k = Math.max(1, Math.round(s.blockScale * Math.max(unit, 0.25)));
  const work = k > 1 ? resized(b, Math.max(8, Math.trunc(b.width / k)), Math.max(8, Math.trunc(b.height / k)), true) : b;
  const p = toPlanes(work);
  const rng = new SeededRandom(seed, 61);

  const quality = Math.max(1, Math.min(100, s.quality));
  const scale = (quality < 50 ? 5000 / quality : 200 - 2 * quality) / 100;
  const tables = (base: number[]) => {
    const q = Float32Array.from(base, (v) => Math.max(1, Math.round(v * scale)));
    // Scramble: swap a fraction of entries so frequencies are quantized by the wrong step.
    for (let i = 0; i < Math.trunc(s.scramble * 64); i++) {
      const a = rng.int(64), c = rng.int(64);
      [q[a], q[c]] = [q[c], q[a]];
    }
    // Mismatch: dequantize with a randomly distorted copy of the table.
    // The DC step stays intact so overall tone survives and only texture breaks.
    const dq = q.map((v) => v * Math.exp(s.mismatch * rng.signed() * 1.5));
    dq[0] = q[0];
    return { q, dq };
  };
  const lt = tables(LUMA_TABLE), ct = tables(CHROMA_TABLE);

  p.y = processPlane(p.y, p.w, p.h, lt, s, rng);
  p.cb = processPlane(p.cb, p.w, p.h, ct, s, rng);
  p.cr = processPlane(p.cr, p.w, p.h, ct, s, rng);
  fromPlanes(p, work);
  return k > 1 ? resized(work, b.width, b.height, false) : work;
}

function processPlane(plane: Float32Array, w: number, h: number, t: { q: Float32Array; dq: Float32Array },
  s: QuantSettings, rng: SeededRandom): Float32Array {
  const out = new Float32Array(plane);
  const block = new Float32Array(64), coeff = new Float32Array(64), tmp = new Float32Array(64);
  let drift = 0;
  const corruption = s.corruption, dcDrift = s.dcDrift;

  for (let by = 0; by < h; by += 8) {
    for (let bx = 0; bx < w; bx += 8) {
      // Load (edge pixels are clamped).
      for (let y = 0; y < 8; y++) {
        const row = Math.min(h - 1, by + y) * w;
        for (let x = 0; x < 8; x++) block[y * 8 + x] = plane[row + Math.min(w - 1, bx + x)] - 128;
      }
      forwardDCT(block, coeff, tmp);

      for (let i = 0; i < 64; i++) {
        let q = Math.round(coeff[i] / t.q[i]);
        if (corruption > 0 && rng.unit() < corruption) {
          switch (rng.int(3)) {
            case 0: q = -q; break;
            case 1: q += rng.int(17) - 8; break;
            default: q *= 2 + rng.int(6);
          }
        }
        coeff[i] = q * t.dq[i];
      }
      if (dcDrift > 0) {
        // Like a broken DC difference chain: an offset jumps in and slowly fades out,
        // and every block row starts clean (a "restart marker").
        if (bx === 0) drift = 0;
        drift *= 0.97;
        if (rng.unit() < 0.04 * dcDrift) drift = rng.signed() * dcDrift * 90;
        coeff[0] += drift * 8;
      }

      inverseDCT(coeff, block, tmp);
      for (let y = 0; y < 8 && by + y < h; y++)
        for (let x = 0; x < 8 && bx + x < w; x++) out[(by + y) * w + bx + x] = block[y * 8 + x] + 128;
    }
  }
  return out;
}

// 8-point DCT-II pair using even/odd symmetry: cos((2(7−k)+1)uπ/16) = (−1)^u · cos((2k+1)uπ/16),
// so each output is a 4-term dot product of the folded sums or differences (half the multiplies).

function dct8(src: Float32Array, so: number, ss: number, dst: Float32Array, d0: number, ds: number) {
  const x0 = src[so], x1 = src[so + ss], x2 = src[so + 2 * ss], x3 = src[so + 3 * ss];
  const x4 = src[so + 4 * ss], x5 = src[so + 5 * ss], x6 = src[so + 6 * ss], x7 = src[so + 7 * ss];
  const s0 = x0 + x7, s1 = x1 + x6, s2 = x2 + x5, s3 = x3 + x4;
  const e0 = x0 - x7, e1 = x1 - x6, e2 = x2 - x5, e3 = x3 - x4;
  const c = COS;
  dst[d0] = c[0] * (s0 + s1 + s2 + s3);
  dst[d0 + ds] = c[8] * e0 + c[9] * e1 + c[10] * e2 + c[11] * e3;
  dst[d0 + 2 * ds] = c[16] * s0 + c[17] * s1 + c[18] * s2 + c[19] * s3;
  dst[d0 + 3 * ds] = c[24] * e0 + c[25] * e1 + c[26] * e2 + c[27] * e3;
  dst[d0 + 4 * ds] = c[32] * s0 + c[33] * s1 + c[34] * s2 + c[35] * s3;
  dst[d0 + 5 * ds] = c[40] * e0 + c[41] * e1 + c[42] * e2 + c[43] * e3;
  dst[d0 + 6 * ds] = c[48] * s0 + c[49] * s1 + c[50] * s2 + c[51] * s3;
  dst[d0 + 7 * ds] = c[56] * e0 + c[57] * e1 + c[58] * e2 + c[59] * e3;
}

function idct8(src: Float32Array, so: number, ss: number, dst: Float32Array, d0: number, ds: number) {
  const X0 = src[so], X1 = src[so + ss], X2 = src[so + 2 * ss], X3 = src[so + 3 * ss];
  const X4 = src[so + 4 * ss], X5 = src[so + 5 * ss], X6 = src[so + 6 * ss], X7 = src[so + 7 * ss];
  const c = COS;
  for (let k = 0; k < 4; k++) {
    const even = c[k] * X0 + c[16 + k] * X2 + c[32 + k] * X4 + c[48 + k] * X6;
    const odd = c[8 + k] * X1 + c[24 + k] * X3 + c[40 + k] * X5 + c[56 + k] * X7;
    dst[d0 + k * ds] = even + odd;
    dst[d0 + (7 - k) * ds] = even - odd;
  }
}

function forwardDCT(input: Float32Array, output: Float32Array, tmp: Float32Array) {
  for (let y = 0; y < 8; y++) dct8(input, y * 8, 1, tmp, y * 8, 1); // rows: tmp[y][u]
  for (let u = 0; u < 8; u++) dct8(tmp, u, 8, output, u, 8); // columns: F[v][u]
}

function inverseDCT(input: Float32Array, output: Float32Array, tmp: Float32Array) {
  for (let v = 0; v < 8; v++) idct8(input, v * 8, 1, tmp, v * 8, 1); // rows: tmp[v][x]
  for (let x = 0; x < 8; x++) idct8(tmp, x, 8, output, x, 8); // columns: f[y][x]
}
