import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  cssOf,
  filled,
  over,
  packedOf,
  parsedColor,
} from '../../../../../components/cells/page/cellColors';

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

  test('fills a ground with a see-through color as the GPU of the browser fills one, which takes the color as bytes with its share worked in before it blends, so a tint of a line is the level the browser draws it, a level off what blending the unrounded color gives', () => {
    assert.deepStrictEqual(
      filled([255, 255, 255, 1], [170, 0, 0, 0.08]),
      [249, 235, 235, 1],
    );
    assert.deepStrictEqual(
      filled([249, 235, 235, 1], [170, 0, 0, 0.2]),
      [233, 188, 188, 1],
    );
    assert.deepStrictEqual(
      filled([17, 17, 17, 1], [255, 204, 0, 1]),
      [255, 204, 0, 1],
    );
  });

  test('reads the parts of a color the browser writes in a space of its own, not the digits of the name of the space, as the 3 of display-p3 was taken for red', () => {
    assert.deepStrictEqual(
      parsedColor('color(display-p3 1 0 0)'),
      [255, 0, 0, 1],
    );
    assert.deepStrictEqual(
      parsedColor('color(display-p3 0 0.5 1 / 0.25)'),
      [0, 127.5, 255, 0.25],
    );
  });

  test('packs each part of a color as a whole byte, so one out of range stays in its own byte rather than spilling into the next', () => {
    assert.strictEqual(
      packedOf([300, -5, 127.6, 1]),
      packedOf([255, 0, 127, 1]),
    );
  });

  test('writes a color for a canvas and packs it as the bytes of a pixel, red first', () => {
    assert.strictEqual(cssOf([1, 2, 3, 1]), 'rgb(1 2 3)');
    assert.strictEqual(packedOf([1, 2, 3, 1]), 0xff030201);
  });
});
