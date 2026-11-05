import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  blankRuns,
  breakOffsets,
  markedRowStarts,
  rowBreaksAt,
  rowStarts,
  wrapColumns,
  wrapIndent,
  wrappedLines,
  wrapStarts,
} from '../../ui/wordWrap';
import type { TextWidths } from '../../ui/textWidths';

function space(column: number) {
  return { column, tab: false };
}

function drawnAs(columns: Readonly<Record<string, number>>): TextWidths {
  return { char: 10, of: (cluster) => (columns[cluster] ?? 1) * 10 };
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

suite('Word wrap', () => {
  test('estimates a line that fits on one row as one row', () => {
    assert.strictEqual(wrappedLines('', 10), 1);
    assert.strictEqual(wrappedLines('0123456789', 10), 1);
  });

  test('estimates a line wrapped before the word that does not fit, the spaces before it hanging at the end of the row', () => {
    assert.strictEqual(wrappedLines('one two three', 7), 2);
    assert.strictEqual(wrappedLines('one two three', 6), 3);
    assert.strictEqual(wrappedLines('one       ', 3), 1);
    assert.strictEqual(wrappedLines('        one', 4), 2);
  });

  test('estimates a word longer than a row broken anywhere, starting it on a row of its own', () => {
    assert.strictEqual(wrappedLines('abcdefghij', 4), 3);
    assert.strictEqual(wrappedLines('a abcdefgh', 4), 3);
  });

  test('estimates a line wrapped at spaces and tabs, not at a non-breaking space, though the browser breaks after other punctuation too', () => {
    assert.strictEqual(wrappedLines('ab\u00a0cd', 2), 3);
    assert.strictEqual(wrappedLines('one\ttwo', 4), 2);
  });

  test('breaks a line where VS Code does, after . , ; ) ] } ? | / & and before ( [ { +, keeping a run of them together, and leaves the breaks at spaces to the browser', () => {
    assert.deepStrictEqual(breakOffsets('log.info(strings.log)'), [4, 8, 17]);
    assert.deepStrictEqual(breakOffsets('f(a)), b[0] = {c}'), [1, 8]);
    assert.deepStrictEqual(breakOffsets('a+b?c|d/e&f;g'), [1, 4, 6, 8, 10, 12]);
    assert.deepStrictEqual(breakOffsets('((a'), []);
    assert.deepStrictEqual(breakOffsets('a((b'), [1]);
    assert.deepStrictEqual(breakOffsets('one two'), []);
  });

  test('estimates a line broken after the punctuation VS Code breaks at', () => {
    assert.strictEqual(wrappedLines('log.info(strings.log)', 12), 3);
  });

  test('indents the rows a line wraps onto as far as the line, as VS Code does, unless not even a wide character would fit after the indentation', () => {
    assert.strictEqual(wrapIndent('    a', 10), 4);
    assert.strictEqual(wrapIndent('\t\ta', 20), 8);
    assert.strictEqual(wrapIndent('a', 10), 0);
    assert.strictEqual(wrapIndent('    ', 10), 0);
    assert.strictEqual(wrapIndent('        a', 10), 8);
    assert.strictEqual(wrapIndent('        a', 9), 0);
  });

  test('indents no rows of a line indented to a column off the tab stops that has tabs, as the browser counts its tab stops from where the indented rows start', () => {
    assert.strictEqual(wrapIndent('  a\tb', 10), 0);
    assert.strictEqual(wrapIndent('    a\tb', 10), 4);
  });

  test('estimates the rows a line wraps onto as indented as the line, keeping its indentation on the row with the code it indents', () => {
    assert.strictEqual(wrappedLines('  aaa bbb ccc', 7), 3);
    assert.strictEqual(wrappedLines('        abcdefgh', 10), 4);
  });

  test('finds where each row a line wraps onto starts: at the word that does not fit, past the spaces hanging before it, anywhere in a word longer than a row, and past the indentation', () => {
    assert.deepStrictEqual(wrapStarts('', 10), [0]);
    assert.deepStrictEqual(wrapStarts('one two three', 7), [0, 8]);
    assert.deepStrictEqual(wrapStarts('abcdefghij', 4), [0, 4, 8]);
    assert.deepStrictEqual(wrapStarts('a abcdefgh', 4), [0, 2, 6]);
    assert.deepStrictEqual(wrapStarts('log.info(strings.log)', 12), [0, 8, 17]);
    assert.deepStrictEqual(wrapStarts('        abcdefgh', 10), [0, 10, 12, 14]);
    assert.deepStrictEqual(wrapStarts('    one two three', 9), [0, 8, 12]);
  });

  test('wraps a line by how wide its characters are drawn once measured, an emoji over two columns and a Chinese character two, breaking between Chinese characters and emoji as the browser does in the diff, but not before closing punctuation, after opening punctuation, nor inside a character of several code points', () => {
    const wide = drawnAs({
      中: 2,
      文: 2,
      '。': 2,
      '「': 2,
      '✅': 2.29,
      '👍🏽': 2.29,
    });
    assert.deepStrictEqual(wrapStarts('x 中文中文', 6, 0, wide), [0, 4]);
    assert.deepStrictEqual(wrapStarts('ab ✅✅✅', 6, 0, wide), [0, 4]);
    assert.deepStrictEqual(wrapStarts('中文。中文', 5, 0, wide), [0, 1, 3]);
    assert.deepStrictEqual(wrapStarts('中「中文', 5, 0, wide), [0, 1, 3]);
    assert.deepStrictEqual(wrapStarts('👍🏽👍🏽', 3, 0, wide), [0, 4]);
    assert.deepStrictEqual(wrapStarts('中文中文', 3, 0, wide), [0, 1, 2, 3]);
    assert.deepStrictEqual(wrapStarts('abcdefgh', 4, 0, wide), [0, 4]);
    assert.deepStrictEqual(wrapStarts('abc 中', 5, 0, wide), [0, 4]);
    assert.strictEqual(wrappedLines('x 中文中文', 6, wide), 2);
  });

  test('never starts a row between the halves of a character outside the basic plane', () => {
    assert.deepStrictEqual(wrapStarts('a😀😀', 2), [0, 1, 3]);
  });

  test('draws a tab to the next stop of four columns', () => {
    assert.strictEqual(wrappedLines('\tab', 6), 1);
    assert.strictEqual(wrappedLines('a\tbcd', 6), 2);
  });

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

  test('finds the first character of each row by where the browser laid the characters out, reading few of them', () => {
    const laidOut = [0, 0, 0, 1, 1, 2];
    assert.deepStrictEqual(
      rowStarts(6, 3, (offset) => laidOut[offset]),
      [0, 3, 5],
    );
    assert.deepStrictEqual(
      rowStarts(3, 1, () => 0),
      [0],
    );
    let reads = 0;
    assert.deepStrictEqual(
      rowStarts(1000, 10, (offset) => {
        reads++;
        return Math.floor(offset / 100);
      }),
      [0, 100, 200, 300, 400, 500, 600, 700, 800, 900],
    );
    assert.ok(reads < 100, `${reads} reads`);
  });

  test('finds the rows of a long line in a few reads each, looking near where the row before would end, as each read asks the browser where a character is', () => {
    let reads = 0;
    const rowOf = (offset: number) => {
      reads++;
      return Math.floor(offset / 70) + (offset % 70 >= 65 ? 1 : 0);
    };
    const starts = rowStarts(14_000, 200, rowOf);
    assert.strictEqual(starts.length, 200);
    assert.deepStrictEqual(starts.slice(0, 3), [0, 65, 135]);
    assert.ok(reads < 200 * 8, `${reads} reads`);
  });

  test('marks the rows of a line of at most 200 rows, and of a longer one none, reading nothing of it, as reading thousands of rows froze the page', () => {
    let reads = 0;
    const rowOf = (offset: number) => {
      reads++;
      return Math.floor(offset / 10);
    };
    assert.strictEqual(markedRowStarts(2000, 200, rowOf).length, 200);
    reads = 0;
    assert.deepStrictEqual(markedRowStarts(2010, 201, rowOf), [0]);
    assert.strictEqual(reads, 0);
  });

  test('fits as many whole characters in a row as its width holds, and at least one', () => {
    assert.strictEqual(wrapColumns(100, 7.2), 13);
    assert.strictEqual(wrapColumns(72, 7.2), 10);
    assert.strictEqual(wrapColumns(3, 7.2), 1);
  });

  test('expects no line to wrap while the characters have no width, as in a hidden column', () => {
    assert.strictEqual(wrapColumns(0, 0), Infinity);
    assert.strictEqual(wrappedLines('one two', wrapColumns(0, 0)), 1);
  });
});
