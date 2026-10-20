/** Opaque 8-bit RGBA pixels, row-major, top row first. Uint8ClampedArray rounds and clamps on write. */
export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

type Ctx2D = OffscreenCanvasRenderingContext2D;

function context(w: number, h: number, willRead = true): Ctx2D {
  const ctx = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: willRead, alpha: true });
  if (!ctx) throw new Error('2D canvas unavailable');
  return ctx;
}

/** Draws `source` (flattened onto white) into a new buffer, optionally resampled. */
export function bufferFrom(source: CanvasImageSource & { width: number; height: number }, width?: number, height?: number, smooth = true): PixelBuffer {
  const w = Math.max(1, Math.round(width ?? source.width));
  const h = Math.max(1, Math.round(height ?? source.height));
  const ctx = context(w, h);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = smooth;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  return { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data };
}

export function toCanvas(b: PixelBuffer): OffscreenCanvas {
  const ctx = context(b.width, b.height, false);
  ctx.putImageData(new ImageData(b.data as Uint8ClampedArray<ArrayBuffer>, b.width, b.height), 0, 0);
  return ctx.canvas;
}

export function resized(b: PixelBuffer, w: number, h: number, smooth: boolean): PixelBuffer {
  if (w === b.width && h === b.height) return b;
  if (!smooth) return resizeNearest(b, w, h);
  return bufferFrom(toCanvas(b), w, h, true);
}

/** Exact nearest-neighbour upscale; canvas "smoothing off" is not guaranteed pixel-exact everywhere. */
function resizeNearest(b: PixelBuffer, w: number, h: number): PixelBuffer {
  const out = new Uint8ClampedArray(w * h * 4);
  const src = new Uint32Array(b.data.buffer, b.data.byteOffset, b.width * b.height);
  const dst = new Uint32Array(out.buffer);
  const xs = new Int32Array(w);
  for (let x = 0; x < w; x++) xs[x] = Math.min(b.width - 1, Math.floor(((x + 0.5) * b.width) / w));
  for (let y = 0; y < h; y++) {
    const row = Math.min(b.height - 1, Math.floor(((y + 0.5) * b.height) / h)) * b.width;
    const o = y * w;
    for (let x = 0; x < w; x++) dst[o + x] = src[row + xs[x]];
  }
  return { width: w, height: h, data: out };
}

export const luma = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

export const wrap = (v: number, n: number) => {
  const m = v % n;
  return m < 0 ? m + n : m;
};

/** Deterministic 32-bit SplitMix-style generator so glitches stay stable between preview and export. */
export class SeededRandom {
  private state: number;

  constructor(seed: number, salt = 0) {
    const lo = seed >>> 0, hi = Math.floor(seed / 4294967296) >>> 0;
    this.state = (Math.imul(lo ^ Math.imul(hi, 0x85ebca6b), 0x9e3779b9) ^ Math.imul(salt + 1, 0xd1b54a33)) >>> 0;
    this.next();
  }

  /** Uniform 32-bit unsigned integer. */
  next(): number {
    let z = (this.state = (this.state + 0x9e3779b9) | 0);
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  }

  /** Uniform in 0..<1. */
  unit(): number {
    return this.next() / 4294967296;
  }

  /** Uniform in -1...1. */
  signed(): number {
    return this.unit() * 2 - 1;
  }

  int(upperBound: number): number {
    return upperBound <= 0 ? 0 : Math.floor(this.unit() * upperBound);
  }
}
