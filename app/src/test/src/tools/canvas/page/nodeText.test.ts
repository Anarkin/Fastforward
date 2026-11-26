import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { textRows } from '../../../../../tools/canvas/page/nodeText';

const rowsOf = (text: string, columns: number, most = 9) =>
  textRows(text, columns, most, () => 1).map((row) =>
    row.map((glyph) => glyph.text).join(''),
  );

suite('Canvas node text', () => {
  test('lets a blank at the end of a full row hang, starting the next row with the word after it, as a word ran into the next one', () => {
    assert.deepStrictEqual(rowsOf('ab cd ef', 5), ['ab cd', 'ef']);
    assert.deepStrictEqual(rowsOf('text far longer than its node', 15), [
      'text far longer',
      'than its node',
    ]);
  });

  test('keeps the blanks a line starts with, and drops those a wrapped row would start with', () => {
    assert.deepStrictEqual(rowsOf('  ab cd    ef', 5), ['  ab', 'cd', 'ef']);
  });

  test('breaks a word longer than the row where the row ends', () => {
    assert.deepStrictEqual(rowsOf('abcdefg h', 3), ['abc', 'def', 'g h']);
  });
});
