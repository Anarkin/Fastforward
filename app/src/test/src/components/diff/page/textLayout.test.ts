import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  gapWidth,
  wordPadding,
} from '../../../../../components/diff/page/textLayout';

function layoutSteps(padding: number, scale: number): number[] {
  const exact = padding * scale * 64;
  return [Math.floor(exact), Math.round(exact)];
}

suite('Drawing code', () => {
  test('pads changed words up to the top and down to the bottom of their line, apart as the text sits off center at scales like 125%, and not before the text is measured', () => {
    const line = { top: 154, bottom: 176 };
    const even = wordPadding(line, { top: 157, bottom: 173 }, 1);
    assert.deepStrictEqual(layoutSteps(even.top, 1), [192, 192]);
    assert.deepStrictEqual(layoutSteps(even.bottom, 1), [192, 192]);
    const off = wordPadding(
      line,
      { top: 154 + 2.4000091552734375, bottom: 176 - 3.5999908447265625 },
      1.25,
    );
    assert.deepStrictEqual(layoutSteps(off.top, 1.25), [192, 192]);
    assert.deepStrictEqual(layoutSteps(off.bottom, 1.25), [288, 288]);
    assert.deepStrictEqual(wordPadding(line, { top: 0, bottom: 0 }, 1), {
      top: 0,
      bottom: 0,
    });
    const over = wordPadding(line, { top: 150, bottom: 180 }, 1);
    assert.deepStrictEqual(
      [layoutSteps(over.top, 1), layoutSteps(over.bottom, 1)],
      [
        [0, 0],
        [0, 0],
      ],
    );
  });

  test('makes the bar where words were inserted 2 pixels wide, a whole number of screen pixels at any scale so it stays sharp', () => {
    for (const [scale, pixels] of [
      [1, 2],
      [1.25, 3],
      [1.5, 3],
      [1.75, 4],
      [2, 4],
    ]) {
      assert.deepStrictEqual(layoutSteps(gapWidth(scale), scale), [
        pixels * 64,
        pixels * 64,
      ]);
    }
  });
});
