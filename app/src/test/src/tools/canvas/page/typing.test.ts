import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { rowsOf } from '../../../../../tools/canvas/page/nodeText';
import {
  allSelected,
  deleted,
  inserted,
  movedAcross,
  movedRows,
  movedToRowEdge,
  selectedText,
  type Caret,
} from '../../../../../tools/canvas/page/typing';

const widths = { char: 1, of: () => 1 };

const at = (text: string, head: number, anchor = head): Caret => ({
  text,
  anchor,
  head,
});

suite('Canvas typing', () => {
  test('types over the text selected, the caret after what was typed', () => {
    assert.deepStrictEqual(inserted(at('abc', 1), 'xy'), at('axybc', 3));
    assert.deepStrictEqual(inserted(at('abcd', 3, 1), '-'), at('a-d', 2));
  });

  test('deletes a character with its accents and a wide character whole, a line break with its carriage return, or the text selected', () => {
    const accented = 'aéb';
    assert.deepStrictEqual(deleted(at(accented, 3), false, false), at('ab', 1));
    assert.deepStrictEqual(deleted(at(accented, 1), true, false), at('ab', 1));
    assert.deepStrictEqual(deleted(at('a\r\nb', 3), false, false), at('ab', 1));
    assert.deepStrictEqual(deleted(at('a😀b', 1), true, false), at('ab', 1));
    assert.deepStrictEqual(
      deleted(at('abcd', 1, 3), false, false),
      at('ad', 1),
    );
    assert.deepStrictEqual(deleted(at('ab', 0), false, false), at('ab', 0));
  });

  test('deletes a word with the blanks before it, and a line break alone at the start of a line', () => {
    assert.deepStrictEqual(
      deleted(at('foo bar', 7), false, true),
      at('foo ', 4),
    );
    assert.deepStrictEqual(
      deleted(at('foo bar', 4), false, true),
      at('bar', 0),
    );
    assert.deepStrictEqual(deleted(at('foo bar', 3), true, true), at('foo', 3));
    assert.deepStrictEqual(deleted(at('a.,b', 1), true, true), at('ab', 1));
    assert.deepStrictEqual(
      deleted(at('ab\ncd', 3), false, true),
      at('abcd', 2),
    );
  });

  test('moves the caret a character or a word across, selecting with Shift, and to the side of the selection it moves toward', () => {
    assert.deepStrictEqual(
      movedAcross(at('foo bar', 0), true, true, false),
      at('foo bar', 3),
    );
    assert.deepStrictEqual(
      movedAcross(at('foo bar', 3), true, true, false),
      at('foo bar', 7),
    );
    assert.deepStrictEqual(
      movedAcross(at('foo bar', 1), true, false, true),
      at('foo bar', 2, 1),
    );
    assert.deepStrictEqual(
      movedAcross(at('foo bar', 5, 2), false, false, false),
      at('foo bar', 2),
    );
    assert.deepStrictEqual(
      movedAcross(at('foo bar', 2, 5), true, false, false),
      at('foo bar', 5),
    );
    assert.deepStrictEqual(
      movedAcross(at('ab', 2), true, false, false),
      at('ab', 2),
    );
  });

  test('moves the caret up and down the rows the text wraps onto as every view wraps it, keeping its column, to either end past the first and the last, and to the ends of its row, before the blank a wrapped row hangs', () => {
    const text = 'ab cd ef' + String.fromCharCode(10) + 'gh';
    const rows = rowsOf(text, 4, widths);
    assert.deepStrictEqual(
      movedRows(at(text, 1), rows, widths, 1, false),
      at(text, 4),
    );
    assert.deepStrictEqual(
      movedRows(at(text, 4), rows, widths, 1, true),
      at(text, 7, 4),
    );
    assert.deepStrictEqual(
      movedRows(at(text, 1), rows, widths, -1, false),
      at(text, 0),
    );
    assert.deepStrictEqual(
      movedRows(at(text, 10), rows, widths, 1, false),
      at(text, 11),
    );
    assert.deepStrictEqual(
      movedToRowEdge(at(text, 1), rows, widths, true, false),
      at(text, 2),
    );
    assert.deepStrictEqual(
      movedToRowEdge(at(text, 4), rows, widths, false, true),
      at(text, 3, 4),
    );
    assert.deepStrictEqual(
      movedToRowEdge(at(text, 10), rows, widths, true, false),
      at(text, 11),
    );
  });

  test('selects the whole text and gives what is selected', () => {
    assert.deepStrictEqual(allSelected(at('abc', 1)), at('abc', 3, 0));
    assert.strictEqual(selectedText(at('abcd', 3, 1)), 'bc');
  });
});
