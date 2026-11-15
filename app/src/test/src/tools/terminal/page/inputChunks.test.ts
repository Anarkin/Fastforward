import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { inputChunks } from '../../../../../tools/terminal/page/inputChunks';

suite('Terminal protocol', () => {
  test('cuts a long paste into chunks, never between the halves of a character', () => {
    assert.deepStrictEqual(inputChunks('abcdefg', 3), ['abc', 'def', 'g']);
    assert.deepStrictEqual(inputChunks('ab😀cd', 3), ['ab', '😀c', 'd']);
    assert.deepStrictEqual(inputChunks('', 3), []);
  });
});
