import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { realSizeOf } from '../../../../lib/page/images';

suite('Images', () => {
  test('shows a pixel of an image at its real size on a pixel of the screen however the display is scaled', () => {
    assert.deepStrictEqual(
      realSizeOf({ width: 3000, height: 2000 }, 1, false),
      {
        width: 3000,
        height: 2000,
      },
    );
    assert.deepStrictEqual(
      realSizeOf({ width: 3000, height: 2000 }, 1.5, false),
      { width: 2000, height: 2000 / 1.5 },
    );
  });

  test('shows an SVG at its real size in the CSS pixels it is drawn in, as its width and height are lengths rather than pixels of a raster', () => {
    assert.deepStrictEqual(realSizeOf({ width: 10, height: 20 }, 1.5, true), {
      width: 10,
      height: 20,
    });
  });
});
