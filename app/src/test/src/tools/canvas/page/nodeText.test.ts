import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  laidOut,
  offsetAt,
  placeOf,
  rowEndOf,
  textRows,
} from '../../../../../tools/canvas/page/nodeText';

const rowsOf = (text: string, columns: number, most = 9) =>
  textRows(text, columns, most, () => 1).map((row) =>
    row.map((glyph) => glyph.text).join(''),
  );

const wideOf = (cluster: string) => (cluster === '中' ? 2 : 1);

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

  test('tells the stretch of the text each row covers, the blanks a wrapped row hangs or drops and the line break left to no row', () => {
    const rows = laidOut('ab cd   ef\r\ngh', 5, 9, () => 1);
    assert.deepStrictEqual(
      rows.map(({ from, to, wraps }) => [from, to, wraps]),
      [
        [0, 8, true],
        [8, 10, false],
        [12, 14, false],
      ],
    );
    assert.deepStrictEqual(
      rows[0]?.glyphs.map(({ from, to }) => [from, to]),
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 5],
      ],
    );
  });

  test('places a caret on the cell before the character after it, on the next row where a wrapped row ends, past the blanks it hangs and after a wide character, a tab or a sign', () => {
    const rows = laidOut('ab cd   ef\ngh', 5, 9, () => 1);
    assert.deepStrictEqual(placeOf(rows, 0, 5), { row: 0, column: 0 });
    assert.deepStrictEqual(placeOf(rows, 5, 5), { row: 0, column: 5 });
    assert.deepStrictEqual(placeOf(rows, 7, 5), { row: 0, column: 5 });
    assert.deepStrictEqual(placeOf(rows, 8, 5), { row: 1, column: 0 });
    assert.deepStrictEqual(placeOf(rows, 10, 5), { row: 1, column: 2 });
    assert.deepStrictEqual(placeOf(rows, 11, 5), { row: 2, column: 0 });
    const wide = laidOut('a中\tb​c', 20, 9, wideOf);
    assert.deepStrictEqual(
      [0, 1, 2, 3, 4, 5, 6].map((offset) => placeOf(wide, offset, 20)?.column),
      [0, 1, 3, 4, 5, 6, 7],
    );
  });

  test('takes a cell pressed for the place before the character in it, after the second half of a wide one, and the end of the row past its text, before the blank a wrapped row hangs', () => {
    const rows = laidOut('ab cd   ef\ngh', 5, 9, () => 1);
    assert.strictEqual(offsetAt(rows, { row: 0, column: 1 }), 1);
    assert.strictEqual(offsetAt(rows, { row: 0, column: 9 }), 7);
    assert.strictEqual(offsetAt(rows, { row: 1, column: 9 }), 10);
    assert.strictEqual(offsetAt(rows, { row: 2, column: 1 }), 12);
    assert.strictEqual(offsetAt(rows, { row: 7, column: 0 }), 11);
    const wide = laidOut('a中b', 20, 9, wideOf);
    assert.strictEqual(offsetAt(wide, { row: 0, column: 1 }), 1);
    assert.strictEqual(offsetAt(wide, { row: 0, column: 2 }), 2);
    assert.deepStrictEqual(rows.map(rowEndOf), [5, 10, 13]);
  });
});
