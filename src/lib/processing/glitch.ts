import type {
  ChannelShiftSettings, DatabendSettings, DisplacementSettings, GlitchSettings, MacroblockSettings,
  PixelSortSettings, RowShiftSettings, SlitScanSettings, TearingSettings,
} from '../model/settings';
import { chromaSubsample, quantize } from './jpegmosh';
import { luma, SeededRandom, wrap, type PixelBuffer } from './pixelbuffer';

export function applyGlitch(b: PixelBuffer, s: GlitchSettings, unit: number): PixelBuffer {
  if (s.slitScan.isEnabled) slitScan(b, s.slitScan);
  if (s.displacement.isEnabled) displace(b, s.displacement, s.seed);
  if (s.quant.isEnabled) b = quantize(b, s.quant, s.seed, unit);
  if (s.chroma.isEnabled) chromaSubsample(b, s.chroma, unit);
  if (s.macroblock.isEnabled) macroblocks(b, s.macroblock, s.seed, unit);
  if (s.pixelSort.isEnabled) pixelSort(b, s.pixelSort);
  if (s.rowShift.isEnabled) rowShift(b, s.rowShift, s.seed, unit);
  if (s.tearing.isEnabled) tear(b, s.tearing, s.seed);
  if (s.channelShift.isEnabled) channelShift(b, s.channelShift);
  if (s.databend.isEnabled) databend(b, s.databend, s.seed);
  return b;
}

/** Rebuilds the image by asking `source(x, y)` which (unwrapped) source pixel to read for every output pixel. */
function remap(b: PixelBuffer, sx: (x: number, y: number) => number, sy: (x: number, y: number) => number) {
  const w = b.width, h = b.height;
  const src = new Uint32Array(b.data.slice().buffer);
  const dst = new Uint32Array(b.data.buffer, b.data.byteOffset, w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      dst[y * w + x] = src[wrap(sy(x, y), h) * w + wrap(sx(x, y), w)];
    }
  }
}

const ix = (x: number) => x, iy = (_: number, y: number) => y;

// MARK: Slit-scan

function slitScan(b: PixelBuffer, s: SlitScanSettings) {
  const w = b.width, h = b.height;
  const freq = s.frequency, amount = s.amount;
  const frac = (v: number) => v - Math.floor(v);
  if (s.mode === 'wave') {
    if (!s.vertical) remap(b, (x, y) => x + Math.trunc(amount * w * Math.sin((2 * Math.PI * freq * y) / h)), iy);
    else remap(b, ix, (x, y) => y + Math.trunc(amount * h * Math.sin((2 * Math.PI * freq * x) / w)));
  } else if (s.mode === 'stretch') {
    if (!s.vertical) {
      const slit = Math.trunc(s.position * (w - 1));
      remap(b, (x) => (x <= slit ? x : slit + Math.trunc((x - slit) * (1 - amount))), iy);
    } else {
      const slit = Math.trunc(s.position * (h - 1));
      remap(b, ix, (_, y) => (y <= slit ? y : slit + Math.trunc((y - slit) * (1 - amount))));
    }
  } else {
    // Each column is read from a different "moment": an offset growing across the image.
    if (!s.vertical) remap(b, ix, (x, y) => y + Math.trunc(amount * h * frac((freq * x) / w)));
    else remap(b, (x, y) => x + Math.trunc(amount * w * frac((freq * y) / h)), iy);
  }
}

// MARK: Displacement map

function displace(b: PixelBuffer, s: DisplacementSettings, seed: number) {
  const w = b.width, h = b.height, d = b.data;
  let map: Float32Array;
  if (s.source === 'noise') {
    map = valueNoise(w, h, Math.max(2, s.noiseScale * Math.max(w, h)), seed);
  } else {
    map = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      map[i] = s.source === 'red' ? d[o] / 255 : luma(d[o], d[o + 1], d[o + 2]);
    }
  }
  const sx = s.strengthX * w * 2, sy = s.strengthY * h * 2;
  remap(b, (x, y) => x + Math.trunc((map[y * w + x] - 0.5) * sx), (x, y) => y + Math.trunc((map[y * w + x] - 0.5) * sy));
}

/** Bilinear-interpolated value noise in 0...1. */
function valueNoise(w: number, h: number, cell: number, seed: number): Float32Array {
  const gw = Math.trunc(w / cell) + 2, gh = Math.trunc(h / cell) + 2;
  const rng = new SeededRandom(seed, 11);
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = rng.unit();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const gy = y / cell, y0 = Math.trunc(gy), ty = gy - y0;
    const fy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < w; x++) {
      const gx = x / cell, x0 = Math.trunc(gx), tx = gx - x0;
      const fx = tx * tx * (3 - 2 * tx);
      const a = grid[y0 * gw + x0], bb = grid[y0 * gw + x0 + 1];
      const c = grid[(y0 + 1) * gw + x0], dd = grid[(y0 + 1) * gw + x0 + 1];
      const top = a + (bb - a) * fx;
      out[y * w + x] = top + (c + (dd - c) * fx - top) * fy;
    }
  }
  return out;
}

// MARK: Row / column shift

function rowShift(b: PixelBuffer, s: RowShiftSettings, seed: number, unit: number) {
  const rng = new SeededRandom(seed, 21);
  const w = b.width, h = b.height;
  const length = s.vertical ? h : w;
  const lines = s.vertical ? w : h;
  const offsets = new Int32Array(lines);
  const minBand = Math.max(1, s.minBand * Math.max(unit, 0.25));
  const maxBand = Math.max(minBand, s.maxBand * Math.max(unit, 0.25));
  for (let i = 0; i < lines; ) {
    const band = Math.max(1, Math.trunc(minBand + rng.unit() * (maxBand - minBand)));
    const shift = rng.unit() < s.probability ? Math.trunc(rng.signed() * s.maxShift * length) : 0;
    offsets.fill(shift, i, Math.min(lines, i + band));
    i += band;
  }
  if (s.vertical) remap(b, ix, (x, y) => y - offsets[x]);
  else remap(b, (x, y) => x - offsets[y], iy);
}

// MARK: Tearing

function tear(b: PixelBuffer, s: TearingSettings, seed: number) {
  const rng = new SeededRandom(seed, 31);
  const w = b.width, h = b.height, d = b.data;
  const src = d.slice();
  for (let t = 0; t < Math.trunc(s.tears); t++) {
    const y0 = rng.int(h);
    const bandH = Math.max(1, Math.trunc(rng.unit() * s.maxHeight * h));
    const offset = Math.trunc(rng.signed() * s.maxOffset * w);
    const split = Math.trunc(s.rgbSplit * w * (0.5 + rng.unit()));
    const stuck = rng.unit() < s.stuckLines;
    for (let y = y0; y < Math.min(h, y0 + bandH); y++) {
      const row = (stuck ? y0 : y) * w;
      for (let x = 0; x < w; x++) {
        const di = (y * w + x) * 4;
        d[di] = src[(row + wrap(x - offset - split, w)) * 4];
        d[di + 1] = src[(row + wrap(x - offset, w)) * 4 + 1];
        d[di + 2] = src[(row + wrap(x - offset + split, w)) * 4 + 2];
      }
    }
  }
}

// MARK: RGB channel shift

function channelShift(b: PixelBuffer, s: ChannelShiftSettings) {
  const w = b.width, h = b.height, d = b.data;
  const rx = Math.trunc(s.redX * w), ry = Math.trunc(s.redY * h);
  const bx = Math.trunc(s.blueX * w), by = Math.trunc(s.blueY * h);
  const src = d.slice();
  for (let y = 0; y < h; y++) {
    const rRow = wrap(y - ry, h) * w, bRow = wrap(y - by, h) * w;
    for (let x = 0; x < w; x++) {
      const di = (y * w + x) * 4;
      d[di] = src[(rRow + wrap(x - rx, w)) * 4];
      d[di + 2] = src[(bRow + wrap(x - bx, w)) * 4 + 2];
    }
  }
}

// MARK: Macroblock displacement

/** Copies blocks from motion-vector offsets like a broken P-frame. With `smear`, blocks read
 *  from the already-modified output so artefacts drag across the image. */
function macroblocks(b: PixelBuffer, s: MacroblockSettings, seed: number, unit: number) {
  const rng = new SeededRandom(seed, 41);
  const w = b.width, h = b.height;
  const bs = Math.max(2, Math.trunc(s.blockSize * Math.max(unit, 0.25)));
  const out = new Uint32Array(b.data.buffer, b.data.byteOffset, w * h);
  const src = s.smear ? out : out.slice();
  const mvx = s.motionX * w, mvy = s.motionY * h;
  for (let it = 0; it < Math.trunc(s.iterations); it++) {
    for (let by = 0; by < h; by += bs) {
      for (let bx = 0; bx < w; bx += bs) {
        if (!(rng.unit() < s.probability)) continue;
        const dx = Math.trunc(mvx + rng.signed() * s.randomMotion * bs * 2);
        const dy = Math.trunc(mvy + rng.signed() * s.randomMotion * bs * 2);
        for (let y = by; y < Math.min(h, by + bs); y++) {
          const sRow = wrap(y - dy, h) * w;
          for (let x = bx; x < Math.min(w, bx + bs); x++) out[y * w + x] = src[sRow + wrap(x - dx, w)];
        }
      }
    }
  }
}

// MARK: Pixel sorting

const RUN_SLOTS = 131072; // runs longer than this (images over 131k px wide) sort in chunks

function pixelSort(b: PixelBuffer, s: PixelSortSettings) {
  const w = b.width, h = b.height, d = b.data;
  const px = new Uint32Array(d.buffer, d.byteOffset, w * h);
  const lo = Math.min(s.lower, s.upper), hi = Math.max(s.lower, s.upper);
  const lines = s.vertical ? w : h;
  const length = s.vertical ? h : w;
  // Sort keys: 15-bit luma in the high bits, 17-bit position within the run in the low bits,
  // so a plain (native, comparator-free) typed-array sort orders each run.
  const inside = new Uint8Array(w * h), key = new Uint32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const l = luma(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    inside[i] = l >= lo && l <= hi ? 1 : 0;
    key[i] = Math.round(l * 32767);
  }
  const step = s.vertical ? w : 1;
  const runKeys = new Uint32Array(Math.max(length, 1));
  const runPx = new Uint32Array(Math.max(length, 1));

  for (let line = 0; line < lines; line++) {
    const base = s.vertical ? line : line * w;
    let start = 0;
    while (start < length) {
      // Find the next run of pixels whose brightness lies inside the window.
      if (!inside[base + start * step]) { start++; continue; }
      let end = start;
      while (end < length && end - start < RUN_SLOTS && inside[base + end * step]) end++;
      const n = end - start;
      if (n > 1) {
        for (let k = 0; k < n; k++) {
          const i = base + (start + k) * step;
          runKeys[k] = key[i] * RUN_SLOTS + k;
          runPx[k] = px[i];
        }
        const sorted = runKeys.subarray(0, n).sort();
        for (let k = 0; k < n; k++) {
          const src = sorted[s.reverse ? n - 1 - k : k] % RUN_SLOTS;
          px[base + (start + k) * step] = runPx[src];
        }
      }
      start = end;
    }
  }
}

// MARK: Databending

/** Treats the raw RGBA buffer like a file and moves / corrupts byte ranges. Offsets that
 *  are not multiples of 4 rotate the colour channels, giving the typical psychedelic bands. */
function databend(b: PixelBuffer, s: DatabendSettings, seed: number) {
  const rng = new SeededRandom(seed, 51);
  const d = b.data;
  const count = d.length;
  const chunk = Math.max(4, Math.trunc(s.chunkSize * count));
  if (chunk >= count) return;
  for (let g = 0; g < Math.trunc(s.glitches); g++) {
    const start = rng.int(count - chunk);
    const doShift = s.mode === 'shift' || (s.mode === 'both' && g % 2 === 0);
    if (doShift) {
      const offset = rng.int(chunk * 2) - chunk + 1 + rng.int(3);
      const dst = Math.max(0, Math.min(count - chunk, start + offset));
      d.copyWithin(dst, start, start + chunk);
    } else {
      for (let k = start; k < start + chunk; k++) if (rng.unit() < s.intensity) d[k] = rng.next() & 0xff;
    }
  }
  for (let i = 3; i < count; i += 4) d[i] = 255;
}
