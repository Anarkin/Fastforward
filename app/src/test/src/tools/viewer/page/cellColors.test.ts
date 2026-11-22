import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  cssOf,
  over,
  packedOf,
  parsedColor,
} from '../../../../../tools/viewer/page/cellColors';

suite('Colors of the cells', () => {
  test('reads a color as the browser writes it out, with or without its share, and a mix of colors by its parts of one', () => {
    assert.deepStrictEqual(parsedColor('rgb(17, 34, 51)'), [17, 34, 51, 1]);
    assert.deepStrictEqual(
      parsedColor('rgba(255, 204, 0, 0.2)'),
      [255, 204, 0, 0.2],
    );
    assert.deepStrictEqual(
      parsedColor('color(srgb 1 0.8 0 / 0.45)'),
      [255, 204, 0, 0.45],
    );
  });

  test('lays a see-through color over an opaque ground as the whole levels the screen shows, so a dot is the color the browser draws it', () => {
    assert.deepStrictEqual(
      over([17, 17, 17, 1], [221, 221, 221, 0.45]),
      [109, 109, 109, 1],
    );
    assert.deepStrictEqual(
      over([17, 17, 17, 1], [255, 204, 0, 1]),
      [255, 204, 0, 1],
    );
  });

  test('writes a color for a canvas and packs it as the bytes of a pixel, red first', () => {
    assert.strictEqual(cssOf([1, 2, 3, 1]), 'rgb(1 2 3)');
    assert.strictEqual(packedOf([1, 2, 3, 1]), 0xff030201);
  });
});
