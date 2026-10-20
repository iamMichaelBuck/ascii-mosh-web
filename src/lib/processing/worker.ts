/// <reference lib="webworker" />
import type { RenderSettings } from '../model/settings';
import { render } from './pipeline';

export type WorkerRequest =
  | { type: 'image'; imageId: number; bitmap: ImageBitmap }
  | { type: 'render'; imageId: number; settings: RenderSettings }
  | { type: 'export'; bitmap: ImageBitmap; settings: RenderSettings };

export type WorkerResponse =
  | { type: 'rendered'; imageId: number; bitmap: ImageBitmap; asciiText: string | null; duration: number }
  | { type: 'skipped' }
  | { type: 'exported'; blob: Blob; asciiText: string | null }
  | { type: 'error'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let image: { id: number; bitmap: ImageBitmap } | null = null;

const post = (msg: WorkerResponse, transfer: Transferable[] = []) => ctx.postMessage(msg, transfer);

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'image':
        image?.bitmap.close();
        image = { id: msg.imageId, bitmap: msg.bitmap };
        break;
      case 'render': {
        if (!image || image.id !== msg.imageId) return post({ type: 'skipped' });
        const result = render(image.bitmap, msg.settings);
        const bitmap = result.canvas.transferToImageBitmap();
        post({ type: 'rendered', imageId: msg.imageId, bitmap, asciiText: result.asciiText, duration: result.duration }, [bitmap]);
        break;
      }
      case 'export': {
        const result = render(msg.bitmap, msg.settings);
        msg.bitmap.close();
        const blob = await result.canvas.convertToBlob({ type: 'image/png' });
        post({ type: 'exported', blob, asciiText: result.asciiText });
        break;
      }
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
