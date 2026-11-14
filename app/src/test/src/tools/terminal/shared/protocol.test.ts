import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  inputChunks,
  sizeWithin,
} from '../../../../../tools/terminal/shared/protocol';

suite('Terminal protocol', () => {
  test('cuts a long paste into chunks, never between the halves of a character', () => {
    assert.deepStrictEqual(inputChunks('abcdefg', 3), ['abc', 'def', 'g']);
    assert.deepStrictEqual(inputChunks('ab😀cd', 3), ['ab', '😀c', 'd']);
    assert.deepStrictEqual(inputChunks('', 3), []);
  });

  test('takes a size of whole columns and rows from 1, as many as 1000 of them, rather than none past them, as a terminal wider than 1000 columns never started its shell', () => {
    assert.deepStrictEqual(sizeWithin(1, 1000), { columns: 1, rows: 1000 });
    assert.deepStrictEqual(sizeWithin(1150, 2_000_000), {
      columns: 1000,
      rows: 1000,
    });
    for (const [columns, rows] of [
      [0, 24],
      [80.5, 24],
      ['80', 24],
      [80, Number.POSITIVE_INFINITY],
      [80, Number.NaN],
    ]) {
      assert.strictEqual(
        sizeWithin(columns, rows),
        undefined,
        `${columns}x${rows}`,
      );
    }
  });
});
