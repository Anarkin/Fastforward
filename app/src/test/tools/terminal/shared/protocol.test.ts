import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  inputChunks,
  isSize,
} from '../../../../tools/terminal/shared/protocol';

suite('Terminal protocol', () => {
  test('cuts a long paste into chunks, never between the halves of a character', () => {
    assert.deepStrictEqual(inputChunks('abcdefg', 3), ['abc', 'def', 'g']);
    assert.deepStrictEqual(inputChunks('ab😀cd', 3), ['ab', '😀c', 'd']);
    assert.deepStrictEqual(inputChunks('', 3), []);
  });

  test('takes a size of 1 to 1000 whole columns and rows', () => {
    assert.strictEqual(isSize(1, 1000), true);
    for (const [columns, rows] of [
      [0, 24],
      [80, 1001],
      [80.5, 24],
      ['80', 24],
      [80, Number.POSITIVE_INFINITY],
    ]) {
      assert.strictEqual(isSize(columns, rows), false, `${columns}x${rows}`);
    }
  });
});
