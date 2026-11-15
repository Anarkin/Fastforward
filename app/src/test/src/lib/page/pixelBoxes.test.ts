import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { pixelBox, placedBox } from '../../../../lib/page/pixelBoxes';

suite('Cursor', () => {
  test('puts a box given in CSS pixels on whole device pixels, its right and bottom edges rounded on their own', () => {
    assert.deepStrictEqual(
      pixelBox({ left: 72.1, top: 28.7, width: 7.2, height: 18.4 }, 1.25),
      { left: 90, top: 36, width: 9, height: 23 },
    );
    assert.deepStrictEqual(
      pixelBox({ left: 10, top: 20, width: 7.5, height: 18 }, 1),
      { left: 10, top: 20, width: 8, height: 18 },
    );
  });

  test('rounds an edge on half a device pixel up, as the browser snaps the 64ths of a device pixel it lays out in, though its CSS pixels fall a float short of the half', () => {
    const left = 348.3999938964844;
    const top = 588.3999938964844;
    assert.ok(left * 1.25 < 435.5 && top * 1.25 < 735.5);
    assert.deepStrictEqual(
      pixelBox({ left, top, width: 7.200000762939453, height: 17.6 }, 1.25),
      { left: 436, top: 736, width: 9, height: 22 },
    );
  });

  test('places a box of device pixels in CSS pixels from the origin of the element holding it', () => {
    assert.deepStrictEqual(
      placedBox({ left: 90, top: 35, width: 10, height: 25 }, 1.25, {
        left: 10.5,
        top: 4.25,
      }),
      { left: 61.5, top: 23.75, width: 8, height: 20 },
    );
  });
});
