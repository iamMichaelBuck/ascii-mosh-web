import { normalizedOrder, type RenderSettings } from '../model/settings';
import { applyAdjust } from './adjust';
import { renderAscii } from './ascii';
import { applyCrt } from './crt';
import { applyDither } from './dither';
import { applyGlitch } from './glitch';
import { bufferFrom, toCanvas, type PixelBuffer } from './pixelbuffer';

/** Long edge the live preview is rendered at. Pixel-sized parameters are defined
 *  relative to this so exports at full resolution look like the preview. */
export const REFERENCE_SIZE = 1600;

export interface PipelineResult {
  canvas: OffscreenCanvas;
  asciiText: string | null;
  duration: number;
}

/** Adjust always runs first; Glitch, Dither, ASCII and CRT follow in `settings.order`. */
export function render(source: ImageBitmap, settings: RenderSettings): PipelineResult {
  const start = performance.now();
  let buffer: PixelBuffer | null = bufferFrom(source);
  // The ASCII stage outputs a canvas; it is only read back into pixels if a later stage needs them.
  let canvas: OffscreenCanvas | null = null;
  const unit = Math.max(buffer.width, buffer.height) / REFERENCE_SIZE;
  const pixels = () => (buffer ??= bufferFrom(canvas!));

  if (settings.adjust.isEnabled) applyAdjust(buffer, settings.adjust);
  let asciiText: string | null = null;
  for (const stage of normalizedOrder(settings.order)) {
    if (stage === 'glitch' && settings.glitch.isEnabled) {
      buffer = applyGlitch(pixels(), settings.glitch, unit);
      canvas = null;
    } else if (stage === 'dither' && settings.dither.isEnabled) {
      buffer = applyDither(pixels(), settings.dither, unit);
      canvas = null;
    } else if (stage === 'ascii' && settings.ascii.isEnabled) {
      // The rendered text image becomes the input for any stage after it.
      const ascii = renderAscii(pixels(), settings.ascii);
      asciiText = ascii.text;
      canvas = ascii.canvas;
      buffer = null;
    } else if (stage === 'crt' && settings.crt.isEnabled) {
      buffer = applyCrt(pixels(), settings.crt, unit);
      canvas = null;
    }
  }
  return { canvas: canvas ?? toCanvas(buffer!), asciiText, duration: performance.now() - start };
}
