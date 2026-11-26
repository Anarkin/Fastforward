import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  linesOf,
  offsetAt,
  placeOf,
  rowEndOf,
  rowStartOf,
  rowsOf,
} from '../../../../../tools/canvas/page/nodeText';

const wide = /[一-鿿]|\p{Extended_Pictographic}/u;

const widths = {
  char: 1,
  of: (cluster: string) => (wide.test(cluster) ? 2 : 1),
};

const rowTexts = (text: string, wrapAt?: number) =>
  rowsOf(text, wrapAt, widths).map(({ row, from, to }) =>
    row.text.slice(from, to),
  );

suite('Canvas node text', () => {
  test('cuts a text into its lines at every kind of line break, each knowing where it starts in the text and ending in the signs the views draw for its break', () => {
    assert.deepStrictEqual(
      linesOf('ab\r\ncd\ne\rf').map(({ start, end, text, ending }) => [
        start,
        end,
        text,
        ending,
      ]),
      [
        [0, 4, 'ab', '\u240d\u240a'],
        [4, 7, 'cd', '\u240a'],
        [7, 9, 'e', '\u240d'],
        [9, 10, 'f', undefined],
      ],
    );
  });

  test('wraps each line as the views wrap a text, a row of a line starting after the blank the row before it hangs', () => {
    assert.deepStrictEqual(rowTexts('ab cd ef\ngh', 5), ['ab cd ', 'ef', 'gh']);
    assert.deepStrictEqual(rowTexts('ab cd ef', 4), ['ab ', 'cd ', 'ef']);
    assert.deepStrictEqual(rowTexts('ab cd ef'), ['ab cd ef']);
  });

  test('places the caret on the column before the character after it, at the start of the next row where a wrapped row ends, on a blank hanging at the end of a row, a tab too, and tells the cells of the character under it and what is drawn there', () => {
    const rows = rowsOf('ab cd\n中\u0001\tx', 3, widths);
    assert.deepStrictEqual(placeOf(rows, 0, widths), {
      row: 0,
      column: 0,
      cells: 1,
      under: 'a',
    });
    assert.deepStrictEqual(placeOf(rows, 3, widths), {
      row: 1,
      column: 0,
      cells: 1,
      under: 'c',
    });
    assert.deepStrictEqual(placeOf(rows, 6, widths), {
      row: 2,
      column: 0,
      cells: 2,
      under: '中',
    });
    assert.deepStrictEqual(placeOf(rows, 7, widths)?.under, '¤');
    assert.deepStrictEqual(
      [placeOf(rows, 8, widths)?.column, placeOf(rows, 9, widths)?.column],
      [3, 0],
    );
  });

  test('takes a cell pressed for the place before the character in it, after a wide one pressed on its second half, and the end of the row or text past it', () => {
    const rows = rowsOf('a中b\nlast', undefined, widths);
    assert.deepStrictEqual(
      [0, 1, 2, 3, 9].map((column) =>
        offsetAt(rows, { row: 0, column }, widths),
      ),
      [0, 1, 2, 2, 3],
    );
    assert.strictEqual(offsetAt(rows, { row: 7, column: 1 }, widths), 5);
  });

  test('tells where a row starts and where it ends, before the blank a wrapped row hangs', () => {
    const rows = rowsOf('ab cd ef\ngh', 5, widths);
    assert.deepStrictEqual(rows.map(rowStartOf), [0, 6, 9]);
    assert.deepStrictEqual(rows.map(rowEndOf), [5, 8, 11]);
  });
});
