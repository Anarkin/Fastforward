import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  bitmapResizing,
  halvings,
  jpegScaling,
  shapeOf,
  targetSide,
  thumbnailPixels,
} from '../../../../../tools/commander/page/thumbnailSize';

suite('Image sizes', () => {
  test('decodes an image along its longest side at the length of the thumbnail, as a tall and narrow one was decoded widened and many times taller than needed', () => {
    assert.deepStrictEqual(
      bitmapResizing({ width: 100, height: 20_000 }, 144, 2),
      { resizeHeight: 288 },
    );
    assert.deepStrictEqual(
      bitmapResizing({ width: 600, height: 300 }, 144, 1),
      { resizeWidth: 144 },
    );
    assert.deepStrictEqual(
      bitmapResizing({ width: 300, height: 300 }, 144, 1.25),
      { resizeWidth: 180 },
    );
    assert.strictEqual(bitmapResizing(undefined, 144, 1), undefined);
  });

  test('makes a thumbnail as long as the box in pixels of the screen, or as the image when it is smaller, so a small one is shown at its own size', () => {
    assert.strictEqual(targetSide(4032, 144, 1.25), 180);
    assert.strictEqual(targetSide(600, 144, 1), 144);
    assert.strictEqual(targetSide(20, 144, 1.25), 25);
    assert.strictEqual(targetSide(1, 144, 0.5), 1);
  });

  test('takes the shape of a thumbnail from the size the image stores, turned as it was decoded, rather than from what was decoded, which the browser rounds up, as an image of 600 by 300 decoded 216 wide at 150% came out 109 tall and was shown a device pixel taller than its shape', () => {
    assert.deepStrictEqual(
      shapeOf({ width: 216, height: 109 }, { width: 600, height: 300 }),
      { width: 600, height: 300 },
    );
    assert.deepStrictEqual(
      thumbnailPixels(
        shapeOf({ width: 216, height: 109 }, { width: 600, height: 300 }),
        216,
      ),
      { width: 216, height: 108 },
    );
    assert.deepStrictEqual(
      shapeOf({ width: 76, height: 75 }, { width: 601, height: 600 }),
      { width: 601, height: 600 },
    );
    assert.deepStrictEqual(
      shapeOf({ width: 378, height: 504 }, { width: 4032, height: 3024 }),
      { width: 3024, height: 4032 },
    );
    assert.deepStrictEqual(
      shapeOf({ width: 75, height: 76 }, { width: 601, height: 600 }),
      { width: 600, height: 601 },
    );
    assert.deepStrictEqual(shapeOf({ width: 216, height: 109 }, undefined), {
      width: 216,
      height: 109,
    });
  });

  test('fits what was decoded to that length, keeping its shape, whether it came out landscape at the length already, portrait and longer, or whole', () => {
    assert.deepStrictEqual(thumbnailPixels({ width: 180, height: 135 }, 180), {
      width: 180,
      height: 135,
    });
    assert.deepStrictEqual(thumbnailPixels({ width: 180, height: 240 }, 180), {
      width: 135,
      height: 180,
    });
    assert.deepStrictEqual(thumbnailPixels({ width: 600, height: 300 }, 180), {
      width: 180,
      height: 90,
    });
    assert.deepStrictEqual(thumbnailPixels({ width: 20, height: 10 }, 25), {
      width: 25,
      height: 13,
    });
    assert.deepStrictEqual(thumbnailPixels({ width: 4000, height: 1 }, 180), {
      width: 180,
      height: 1,
    });
  });

  test('decodes a JPEG at the smallest eighth, quarter or half of its size that still covers the thumbnail, rounded up as the decoder makes it, or whole when no fraction is big enough', () => {
    assert.deepStrictEqual(jpegScaling({ width: 4032, height: 3024 }, 180), {
      width: 504,
      height: 378,
    });
    assert.deepStrictEqual(jpegScaling({ width: 5712, height: 4284 }, 180), {
      width: 714,
      height: 536,
    });
    assert.deepStrictEqual(jpegScaling({ width: 3271, height: 2453 }, 180), {
      width: 409,
      height: 307,
    });
    assert.deepStrictEqual(jpegScaling({ width: 814, height: 180 }, 180), {
      width: 204,
      height: 45,
    });
    assert.deepStrictEqual(jpegScaling({ width: 3024, height: 4032 }, 720), {
      width: 756,
      height: 1008,
    });
    assert.strictEqual(
      jpegScaling({ width: 300, height: 200 }, 180),
      undefined,
    );
  });

  test('halves what was decoded while it stays at least as big as the thumbnail, so the last step scales it at most twofold, keeping it sharp', () => {
    assert.deepStrictEqual(
      halvings({ width: 504, height: 378 }, { width: 180, height: 135 }),
      [{ width: 252, height: 189 }],
    );
    assert.deepStrictEqual(
      halvings({ width: 4032, height: 3024 }, { width: 180, height: 135 }),
      [
        { width: 2016, height: 1512 },
        { width: 1008, height: 756 },
        { width: 504, height: 378 },
        { width: 252, height: 189 },
      ],
    );
    assert.deepStrictEqual(
      halvings({ width: 204, height: 45 }, { width: 180, height: 40 }),
      [],
    );
  });
});
