import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { ImageCache } from '../../../../../tools/commander/page/paneImages';

class Decoded {
  src = '';
  decode(): Promise<void> {
    return this.src.includes('broken')
      ? Promise.reject(new Error('broken'))
      : Promise.resolve();
  }
}

async function withImages(run: (cache: ImageCache) => Promise<void>) {
  const saved = Reflect.get(globalThis, 'Image');
  Reflect.set(globalThis, 'Image', Decoded);
  try {
    let redrawn = 0;
    const cache = new ImageCache({ redraw: () => (redrawn += 1) });
    await run(cache);
    assert.ok(redrawn > 0);
  } finally {
    Reflect.set(globalThis, 'Image', saved);
  }
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

suite('Commander images', () => {
  test('lets go of the pictures no tile in sight draws any longer, keeping the icons drawn inline, so a session of many folders of images holds only those on screen', async () => {
    await withImages(async (cache) => {
      for (const url of ['blob:one', 'blob:two', 'data:image/svg+xml,icon']) {
        cache.get(url);
      }
      await settled();
      cache.keep(new Set(['blob:two']));
      const before = cache.generation;
      assert.ok(cache.get('blob:two'));
      assert.ok(cache.get('data:image/svg+xml,icon'));
      assert.strictEqual(cache.get('blob:one'), undefined);
      await settled();
      assert.ok(cache.get('blob:one'));
      assert.ok(cache.generation > before);
    });
  });

  test('tells a picture that fails to decode, and keeps no picture let go of while it was still decoding', async () => {
    await withImages(async (cache) => {
      cache.get('blob:broken');
      cache.get('blob:dropped');
      cache.keep(new Set(['blob:broken']));
      await settled();
      assert.strictEqual(cache.failed('blob:broken'), true);
      assert.strictEqual(cache.failed('blob:dropped'), false);
      assert.strictEqual(cache.get('blob:dropped'), undefined);
      cache.keep(new Set());
      assert.strictEqual(cache.failed('blob:broken'), false);
    });
  });
});
