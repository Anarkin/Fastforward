import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { packedOf } from '../../../../../components/cells/page/cellColors';
import { pushOutline } from '../../../../../tools/commander/page/rowOutline';

const blue = [0, 102, 204, 255] as const;

const bands = (scale: number) => {
  const rects: number[] = [];
  pushOutline(
    rects,
    { color: blue, width: 1, offset: -1 },
    { left: 10, top: 20, width: 100, height: 30 },
    scale,
  );
  return Array.from({ length: rects.length / 5 }, (_, at) =>
    rects.slice(at * 5, at * 5 + 4),
  );
};

suite('Commander outline', () => {
  test('draws an outline set inside a row, as a folder dropped on has, as four bands on its edges, a device pixel thick at every scale, as Chromium draws a pixel of CSS no thicker', () => {
    assert.deepStrictEqual(bands(1), [
      [10, 20, 100, 1],
      [10, 49, 100, 1],
      [10, 21, 1, 28],
      [109, 21, 1, 28],
    ]);
    assert.deepStrictEqual(bands(1.5), [
      [11, 21, 98, 1],
      [11, 48, 98, 1],
      [11, 22, 1, 26],
      [108, 22, 1, 26],
    ]);
  });

  test('draws no outline where the look of the row has none, and an outline in its color', () => {
    const rects: number[] = [];
    pushOutline(rects, undefined, { left: 0, top: 0, width: 9, height: 9 }, 1);
    assert.deepStrictEqual(rects, []);
    pushOutline(
      rects,
      { color: blue, width: 1, offset: -1 },
      { left: 0, top: 0, width: 9, height: 9 },
      1,
    );
    assert.strictEqual(rects[4], packedOf(blue));
  });
});
