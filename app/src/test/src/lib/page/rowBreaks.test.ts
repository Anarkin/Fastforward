import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  blankRuns,
  keptSpaceColumns,
  rowBreaksAt,
  spaceColumnsAt,
} from '../../../../lib/page/rowBreaks';
import { columnsOf } from '../../../../lib/page/textColumns';
import type { TextWidths } from '../../../../lib/page/textWidths';

function space(column: number) {
  return { column, tab: false };
}

function drawn(row: string): (index: number) => number {
  return (index) => {
    let columns = 0;
    for (let at = 0; at < index; at++) {
      columns += row.charCodeAt(at) >= 0x3000 ? 2 : 1;
    }
    return columns;
  };
}

suite('Row breaks', () => {
  test('finds where each row a line is broken into ends, after the spaces and tabs hanging at its end, up to one past the edge of a full row', () => {
    assert.deepStrictEqual(rowBreaksAt('one two three', [0, 8], 9), [
      { end: 8, blanks: [space(7)] },
    ]);
    assert.deepStrictEqual(rowBreaksAt('one  two', [0, 5], 5), [
      { end: 5, blanks: [space(3), space(4)] },
    ]);
    assert.deepStrictEqual(rowBreaksAt('one two three', [0, 8], 7), [
      { end: 8, blanks: [space(7)] },
    ]);
    assert.deepStrictEqual(rowBreaksAt('one two   three', [0, 10], 7), [
      { end: 8, blanks: [space(7)] },
    ]);
    assert.deepStrictEqual(rowBreaksAt('a\tbcd', [0, 2], 6), [
      { end: 4, blanks: [{ column: 1, tab: true }] },
    ]);
    assert.deepStrictEqual(rowBreaksAt('        one', [0, 8], 4), [
      { end: 5, blanks: [space(0), space(1), space(2), space(3), space(4)] },
    ]);
  });

  test('finds the column of every space on each row a line is broken into, past the indentation of the rows it wraps onto and by the width its characters are drawn, leaving out those hanging further than one past the edge of a full row, which are out of sight', () => {
    assert.deepStrictEqual(spaceColumnsAt('a b  c d', [0, 5], 6), [
      [1, 3, 4],
      [1],
    ]);
    assert.deepStrictEqual(
      spaceColumnsAt('a b  c d', [0, 5], 6, undefined, 2),
      [[1, 3, 4], [3]],
    );
    assert.deepStrictEqual(spaceColumnsAt('ab    cd', [0, 6], 3), [[2, 3], []]);
    assert.deepStrictEqual(spaceColumnsAt(' a ', [0], Infinity), [[0, 2]]);
    assert.deepStrictEqual(spaceColumnsAt('\u4e2d a b', [0], Infinity, drawn), [
      [2, 4],
    ]);
    assert.deepStrictEqual(spaceColumnsAt('abc', [0], Infinity), [[]]);
  });

  test('ends each row a line wraps onto past the indentation it starts at', () => {
    assert.deepStrictEqual(
      rowBreaksAt('  aaa bbb ccc', [0, 6, 10], 7, undefined, 2),
      [
        { end: 6, blanks: [space(5)] },
        { end: 6, blanks: [space(5)] },
      ],
    );
    assert.deepStrictEqual(
      rowBreaksAt('  aa bbbbbbbbbb', [0, 5, 12], 7, undefined, 2),
      [
        { end: 5, blanks: [space(4)] },
        { end: 8, blanks: [] },
      ],
    );
  });

  test('ends a row and places the blanks hanging at its end by the width its characters are drawn, as a Chinese one takes two columns', () => {
    assert.deepStrictEqual(rowBreaksAt('中文中文 字', [0, 5], 10, drawn), [
      { end: 9, blanks: [space(8)] },
    ]);
  });

  test('joins the spaces hanging at the end of a row side by side into one run, and keeps each tab a blank of its own, so a row of padding is marked once rather than once a space', () => {
    assert.deepStrictEqual(
      blankRuns([
        space(3),
        space(4),
        space(5),
        { column: 6, tab: true },
        space(8),
        space(9),
      ]),
      [
        { column: 3, columns: 3, tab: false },
        { column: 6, columns: 1, tab: true },
        { column: 8, columns: 2, tab: false },
      ],
    );
    assert.deepStrictEqual(blankRuns([]), []);
  });

  test('ends a row where the browser broke it, between punctuation or inside a word too, and finds no breaks in a line on one row', () => {
    assert.deepStrictEqual(rowBreaksAt('a[] }>(list));', [0, 6], 7), [
      { end: 6, blanks: [] },
    ]);
    assert.deepStrictEqual(rowBreaksAt('a abcdefgh', [0, 2, 6], 4), [
      { end: 2, blanks: [space(1)] },
      { end: 4, blanks: [] },
    ]);
    assert.deepStrictEqual(rowBreaksAt('one', [0], 7), []);
  });

  test('keeps the columns of the spaces of a row for as long as its text, its columns and the widths stay, as a file dragged through shows the same rows again and again and the columns of each were counted anew at every step', () => {
    let measured = 0;
    const counting: TextWidths = {
      char: 10,
      of: (cluster) => {
        measured += 1;
        return cluster === '中' ? 20 : 10;
      },
    };
    const text = '中 a  b';
    const first = keptSpaceColumns(text, 40, counting);
    const once = measured;
    const again = keptSpaceColumns(text, 40, counting);

    assert.deepStrictEqual(
      first,
      spaceColumnsAt(text, [0], 40, (part) => columnsOf(part, counting))[0],
    );
    assert.ok(once > 0, String(once));
    assert.strictEqual(again, first);
    assert.notStrictEqual(keptSpaceColumns(text, 3, counting), first);
    assert.deepStrictEqual(keptSpaceColumns(text, 3, counting), [2]);
    assert.deepStrictEqual(keptSpaceColumns('a b', 40, undefined), [1]);
  });
});
