import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { blankRuns, rowBreaksAt } from '../../../../lib/page/rowBreaks';

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
});
