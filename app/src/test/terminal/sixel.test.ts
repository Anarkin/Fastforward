import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { sixelOf } from '../../terminal/sixel';

type Color = readonly [number, number, number];

const red: Color = [255, 0, 0];
const blue: Color = [0, 0, 255];
const white: Color = [255, 255, 255];

function frameOf(width: number, colorAt: (x: number, y: number) => Color) {
  const height = 12;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colorAt(x, y);
      pixels.set([b, g, r, 255], (y * width + x) * 4);
    }
  }
  return { pixels, width };
}

const start = '\x1bP0;1;0q';
const end = '\x1b\\';

suite('Sixel', () => {
  test('draws one color as a run of full sixels, after the size and the palette', () => {
    const { pixels, width } = frameOf(5, () => red);
    assert.strictEqual(
      sixelOf(pixels, width, { x: 0, y: 0, width: 5, height: 6 }),
      `${start}"1;1;5;6#0;2;100;0;0#0!5~${end}`,
    );
  });

  test('writes runs of three or fewer as the characters themselves', () => {
    const { pixels, width } = frameOf(3, () => red);
    assert.strictEqual(
      sixelOf(pixels, width, { x: 0, y: 0, width: 3, height: 6 }),
      `${start}"1;1;3;6#0;2;100;0;0#0~~~${end}`,
    );
  });

  test('draws each color of a band over the same columns, returning to the start of the band between them', () => {
    const { pixels, width } = frameOf(2, (_x, y) => (y < 3 ? red : blue));
    assert.strictEqual(
      sixelOf(pixels, width, { x: 0, y: 0, width: 2, height: 6 }),
      `${start}"1;1;2;6#0;2;100;0;0#1;2;0;0;100#0FF$#1ww${end}`,
    );
  });

  test('skips the columns before a color first shows up in a band', () => {
    const { pixels, width } = frameOf(6, (x) => (x < 5 ? white : red));
    assert.strictEqual(
      sixelOf(pixels, width, { x: 0, y: 0, width: 6, height: 6 }),
      `${start}"1;1;6;6#0;2;100;100;100#1;2;100;0;0#0!5~$#1!5?~${end}`,
    );
  });

  test('starts a new band every six rows, setting only the rows the image has in the last one', () => {
    const { pixels, width } = frameOf(1, () => red);
    assert.strictEqual(
      sixelOf(pixels, width, { x: 0, y: 0, width: 1, height: 7 }),
      `${start}"1;1;1;7#0;2;100;0;0#0~-#0@${end}`,
    );
  });

  test('reads only the region asked for, from anywhere in the frame', () => {
    const { pixels, width } = frameOf(4, (x, y) =>
      x === 2 && y >= 6 ? blue : red,
    );
    assert.strictEqual(
      sixelOf(pixels, width, { x: 2, y: 6, width: 1, height: 6 }),
      `${start}"1;1;1;6#0;2;0;0;100#0~${end}`,
    );
  });

  test('lists the most common colors first and keeps them exact', () => {
    const { pixels, width } = frameOf(4, (x) => (x === 0 ? blue : red));
    assert.strictEqual(
      sixelOf(pixels, width, { x: 0, y: 0, width: 4, height: 6 }),
      `${start}"1;1;4;6#0;2;100;0;0#1;2;0;0;100#0?~~~$#1~${end}`,
    );
  });

  test('draws the rarest colors in the nearest color of the palette when there are more colors than registers', () => {
    const almostRed: Color = [250, 10, 0];
    const { pixels, width } = frameOf(4, (x) =>
      x === 3 ? almostRed : x === 0 ? blue : red,
    );
    assert.strictEqual(
      sixelOf(pixels, width, { x: 0, y: 0, width: 4, height: 6 }, 2),
      `${start}"1;1;4;6#0;2;100;0;0#1;2;0;0;100#0?~~~$#1~${end}`,
    );
  });
});
