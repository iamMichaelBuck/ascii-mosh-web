import { paletteColors, type DitherAlgorithm, type DitherSettings, type RGBColor } from '../model/settings';
import { resized, SeededRandom, type PixelBuffer } from './pixelbuffer';

type Taps = [dx: number, dy: number, weight: number][];

const kernel = (divisor: number, taps: Taps): Taps => taps.map(([dx, dy, w]) => [dx, dy, w / divisor]);

const KERNELS: Partial<Record<DitherAlgorithm, Taps>> = {
  floydSteinberg: kernel(16, [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]]),
  atkinson: kernel(8, [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]]),
  jarvis: kernel(48, [[1, 0, 7], [2, 0, 5], [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3],
    [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1]]),
  stucki: kernel(42, [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2],
    [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1]]),
  burkes: kernel(32, [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2]]),
  sierra: kernel(32, [[1, 0, 5], [2, 0, 3], [-2, 1, 2], [-1, 1, 4], [0, 1, 5], [1, 1, 4], [2, 1, 2],
    [-1, 2, 2], [0, 2, 3], [1, 2, 2]]),
  sierraTwoRow: kernel(16, [[1, 0, 4], [2, 0, 3], [-2, 1, 1], [-1, 1, 2], [0, 1, 3], [1, 1, 2], [2, 1, 1]]),
  sierraLite: kernel(4, [[1, 0, 2], [-1, 1, 1], [0, 1, 1]]),
};

// MARK: - Quantizers

/** Writes the quantized colour of (r, g, b) into `out` and returns it. */
type Quantize = (r: number, g: number, b: number, out: Float32Array) => void;

interface Quantizer { quantize: Quantize; spread: number }

function grayQuantizer(): Quantizer {
  return {
    quantize: (r, _g, _b, out) => { out[0] = out[1] = out[2] = r >= 127.5 ? 255 : 0; },
    spread: 255,
  };
}

function levelsQuantizer(steps: number): Quantizer {
  const q = (v: number) => Math.min(255, Math.max(0, (Math.round((v / 255) * steps) / steps) * 255));
  return {
    quantize: (r, g, b, out) => { out[0] = q(r); out[1] = q(g); out[2] = q(b); },
    spread: 255 / steps,
  };
}

function paletteQuantizer(colors: Float32Array): Quantizer {
  const n = colors.length / 3;
  return {
    quantize: (r, g, b, out) => {
      let best = 0, bestDistance = Infinity;
      for (let k = 0; k < n; k++) {
        const dr = colors[k * 3] - r, dg = colors[k * 3 + 1] - g, db = colors[k * 3 + 2] - b;
        // Weighted ("redmean-ish") distance reads closer to perception than plain RGB.
        const dist = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
        if (dist < bestDistance) { bestDistance = dist; best = k; }
      }
      out[0] = colors[best * 3]; out[1] = colors[best * 3 + 1]; out[2] = colors[best * 3 + 2];
    },
    spread: 255 / Math.max(1, Math.sqrt(n)),
  };
}

const to255 = (cs: RGBColor[]) => Float32Array.from(cs.flatMap((c) => [c.r * 255, c.g * 255, c.b * 255]));

// MARK: - Entry point

export function applyDither(input: PixelBuffer, s: DitherSettings, unit: number): PixelBuffer {
  const scale = Math.max(1, Math.round(s.pixelScale * Math.max(unit, 0.25)));
  const small = scale > 1
    ? resized(input, Math.max(1, Math.trunc(input.width / scale)), Math.max(1, Math.trunc(input.height / scale)), true)
    : input;
  const w = small.width, h = small.height, n = w * h;
  const d = small.data;

  // Float working buffer, 3 floats per pixel.
  const px = new Float32Array(n * 3);
  const isMono = s.colorMode === 'mono';
  // Threshold slider biases the gray value; 0.5 = neutral.
  const bias = (0.5 - s.threshold) * 255;
  for (let i = 0; i < n; i++) {
    const o = i * 4, r = d[o], g = d[o + 1], b = d[o + 2];
    if (isMono) {
      px[i * 3] = px[i * 3 + 1] = px[i * 3 + 2] = 0.299 * r + 0.587 * g + 0.114 * b + bias;
    } else {
      px[i * 3] = r; px[i * 3 + 1] = g; px[i * 3 + 2] = b;
    }
  }

  let quantizer: Quantizer;
  switch (s.colorMode) {
    case 'mono': quantizer = grayQuantizer(); break;
    case 'rgbLevels': quantizer = levelsQuantizer(Math.max(2, s.levels) - 1); break;
    case 'palette': quantizer = paletteQuantizer(to255(paletteColors(s.palette))); break;
    case 'autoPalette': quantizer = paletteQuantizer(medianCut(px, s.autoColors)); break;
  }

  const taps = KERNELS[s.algorithm];
  if (taps) {
    errorDiffuse(px, w, h, taps, quantizer.quantize, s.strength, s.serpentine);
  } else {
    const spread = quantizer.spread * s.strength;
    const rng = new SeededRandom(7);
    const matrix = thresholdMatrix(s.algorithm);
    const q = new Float32Array(3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let t: number;
        switch (s.algorithm) {
          case 'blueNoise': t = interleavedGradientNoise(x, y); break;
          case 'whiteNoise': t = rng.unit(); break;
          case 'threshold': t = 0.5; break;
          default: t = matrix.values[(y % matrix.size) * matrix.size + (x % matrix.size)];
        }
        const i = (y * w + x) * 3, off = (t - 0.5) * spread;
        quantizer.quantize(px[i] + off, px[i + 1] + off, px[i + 2] + off, q);
        px[i] = q[0]; px[i + 1] = q[1]; px[i + 2] = q[2];
      }
    }
  }

  // Back to bytes (mono maps 0/255 onto the chosen dark/light colors).
  const out = new Uint8ClampedArray(n * 4);
  const dark = [s.dark.r * 255, s.dark.g * 255, s.dark.b * 255];
  const light = [s.light.r * 255, s.light.g * 255, s.light.b * 255];
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (isMono) {
      const c = px[i * 3] > 127 ? light : dark;
      out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
    } else {
      out[o] = px[i * 3]; out[o + 1] = px[i * 3 + 1]; out[o + 2] = px[i * 3 + 2];
    }
    out[o + 3] = 255;
  }
  const result: PixelBuffer = { width: w, height: h, data: out };
  return scale > 1 ? resized(result, input.width, input.height, false) : result;
}

// MARK: - Error diffusion

function errorDiffuse(px: Float32Array, w: number, h: number, taps: Taps, quantize: Quantize, strength: number, serpentine: boolean) {
  const q = new Float32Array(3);
  const clamp = (v: number) => (v < -48 ? -48 : v > 303 ? 303 : v);
  const tdx = taps.map((t) => t[0]), tdy = taps.map((t) => t[1]), tw = taps.map((t) => t[2]);
  const nt = taps.length;
  for (let y = 0; y < h; y++) {
    const reverse = serpentine && y % 2 === 1;
    for (let step = 0; step < w; step++) {
      const x = reverse ? w - 1 - step : step;
      const i = (y * w + x) * 3;
      // Clamp accumulated error so it cannot bleed far past hard edges.
      const r = clamp(px[i]), g = clamp(px[i + 1]), b = clamp(px[i + 2]);
      quantize(r, g, b, q);
      px[i] = q[0]; px[i + 1] = q[1]; px[i + 2] = q[2];
      const er = (r - q[0]) * strength, eg = (g - q[1]) * strength, eb = (b - q[2]) * strength;
      for (let k = 0; k < nt; k++) {
        const nx = x + (reverse ? -tdx[k] : tdx[k]), ny = y + tdy[k];
        if (nx < 0 || nx >= w || ny >= h) continue;
        const j = (ny * w + nx) * 3, wt = tw[k];
        px[j] += er * wt; px[j + 1] += eg * wt; px[j + 2] += eb * wt;
      }
    }
  }
}

// MARK: - Ordered dithering matrices

interface Matrix { size: number; values: Float32Array }

function thresholdMatrix(a: DitherAlgorithm): Matrix {
  switch (a) {
    case 'bayer2': return bayer(2);
    case 'bayer4': return bayer(4);
    case 'bayer8': return bayer(8);
    case 'clusteredDot': return clusteredDot(8);
    default: return { size: 1, values: Float32Array.of(0.5) };
  }
}

function bayer(n: number): Matrix {
  let m = [0], size = 1;
  while (size < n) {
    const s2 = size * 2;
    const next = new Array<number>(s2 * s2).fill(0);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const v = m[y * size + x] * 4;
        next[y * s2 + x] = v;
        next[y * s2 + x + size] = v + 2;
        next[(y + size) * s2 + x] = v + 3;
        next[(y + size) * s2 + x + size] = v + 1;
      }
    m = next;
    size = s2;
  }
  return { size: n, values: Float32Array.from(m, (v) => (v + 0.5) / (n * n)) };
}

/** Halftone-like matrix: dots grow from the centre of each cell, rank-ordered for uniform thresholds. */
function clusteredDot(n: number): Matrix {
  const cells: { index: number; value: number }[] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const fx = ((x + 0.5) / n) * 2 * Math.PI, fy = ((y + 0.5) / n) * 2 * Math.PI;
      cells.push({ index: y * n + x, value: -(Math.cos(fx) + Math.cos(fy)) });
    }
  const values = new Float32Array(n * n);
  cells.sort((a, b) => a.value - b.value).forEach((c, rank) => { values[c.index] = (rank + 0.5) / (n * n); });
  return { size: n, values };
}

function interleavedGradientNoise(x: number, y: number) {
  const f = 0.06711056 * x + 0.00583715 * y;
  const v = 52.9829189 * (f - Math.floor(f));
  return v - Math.floor(v);
}

// MARK: - Adaptive palette

function medianCut(px: Float32Array, colors: number): Float32Array {
  const count = px.length / 3;
  const stride = Math.max(1, Math.trunc(count / 20_000));
  const sample: number[][] = [];
  for (let i = 0; i < count; i += stride) sample.push([px[i * 3], px[i * 3 + 1], px[i * 3 + 2]]);
  const boxes: number[][][] = [sample];
  while (boxes.length < Math.max(2, colors)) {
    // Split the box with the widest channel range.
    let bestBox = -1, bestChannel = 0, bestRange = 0;
    boxes.forEach((box, i) => {
      if (box.length <= 1) return;
      const lo = [...box[0]], hi = [...box[0]];
      for (const c of box) for (let k = 0; k < 3; k++) { if (c[k] < lo[k]) lo[k] = c[k]; if (c[k] > hi[k]) hi[k] = c[k]; }
      const r = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
      const ch = r[0] >= r[1] && r[0] >= r[2] ? 0 : r[1] >= r[2] ? 1 : 2;
      if (r[ch] > bestRange) { bestRange = r[ch]; bestBox = i; bestChannel = ch; }
    });
    if (bestBox < 0) break;
    const sorted = boxes[bestBox].sort((a, b) => a[bestChannel] - b[bestChannel]);
    const mid = sorted.length >> 1;
    boxes[bestBox] = sorted.slice(0, mid);
    boxes.push(sorted.slice(mid));
  }
  return Float32Array.from(
    boxes.filter((b) => b.length).flatMap((box) => {
      const sum = [0, 0, 0];
      for (const c of box) { sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2]; }
      return sum.map((v) => v / box.length);
    }),
  );
}
