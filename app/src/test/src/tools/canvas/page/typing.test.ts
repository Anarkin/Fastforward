import * as assert from 'node:assert';
import { suite, test } from 'vitest';
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

const shown = ({ text, anchor, head }: Caret) => ({ text, anchor, head });

suite('Canvas typing', () => {
  test('types over the text selected, the caret after what was typed', () => {
    assert.deepStrictEqual(shown(inserted(at('abc', 1), 'xy')), at('axybc', 3));
    assert.deepStrictEqual(
      shown(inserted(at('abcd', 3, 1), '-')),
      at('a-d', 2),
    );
  });

  test('deletes as the editor deletes: an accent alone before the caret, a character with its accents after it, a wide character whole, a line break with its carriage return, or the text selected', () => {
    const accented = 'aéb';
    assert.deepStrictEqual(
      shown(deleted(at(accented, 3), false, false)),
      at('aeb', 2),
    );
    assert.deepStrictEqual(
      shown(deleted(at(accented, 1), true, false)),
      at('ab', 1),
    );
    assert.deepStrictEqual(
      shown(deleted(at('a\r\nb', 3), false, false)),
      at('ab', 1),
    );
    assert.deepStrictEqual(
      shown(deleted(at('a😀b', 1), true, false)),
      at('ab', 1),
    );
    assert.deepStrictEqual(
      shown(deleted(at('abcd', 1, 3), false, false)),
      at('ad', 1),
    );
    assert.deepStrictEqual(
      shown(deleted(at('ab', 0), false, false)),
      at('ab', 0),
    );
  });

  test('deletes a word with the blanks before it, and a line break alone at the start of a line', () => {
    assert.deepStrictEqual(
      shown(deleted(at('foo bar', 7), false, true)),
      at('foo ', 4),
    );
    assert.deepStrictEqual(
      shown(deleted(at('foo bar', 4), false, true)),
      at('bar', 0),
    );
    assert.deepStrictEqual(
      shown(deleted(at('foo bar', 3), true, true)),
      at('foo', 3),
    );
    assert.deepStrictEqual(
      shown(deleted(at('a.,b', 1), true, true)),
      at('ab', 1),
    );
    assert.deepStrictEqual(
      shown(deleted(at('ab\ncd', 3), false, true)),
      at('abcd', 2),
    );
  });

  test('moves the caret a character or a word across, selecting with Shift, and to the side of the selection it moves toward', () => {
    assert.deepStrictEqual(
      shown(movedAcross(at('foo bar', 0), true, true, false)),
      at('foo bar', 3),
    );
    assert.deepStrictEqual(
      shown(movedAcross(at('foo bar', 3), true, true, false)),
      at('foo bar', 7),
    );
    assert.deepStrictEqual(
      shown(movedAcross(at('foo bar', 1), true, false, true)),
      at('foo bar', 2, 1),
    );
    assert.deepStrictEqual(
      shown(movedAcross(at('foo bar', 5, 2), false, false, false)),
      at('foo bar', 2),
    );
    assert.deepStrictEqual(
      shown(movedAcross(at('foo bar', 2, 5), true, false, false)),
      at('foo bar', 5),
    );
    assert.deepStrictEqual(
      shown(movedAcross(at('ab', 2), true, false, false)),
      at('ab', 2),
    );
  });

  test('moves the caret up and down the rows the text wraps onto as every view wraps it, as the editor moves it, keeping the column it came from, to either end past the first and the last, and to the ends of its row, past the blank a wrapped row hangs and drawn on the row it ends', () => {
    const text = 'ab cd ef' + String.fromCharCode(10) + 'gh';
    const wrapping = { columns: 4, widths };
    assert.deepStrictEqual(
      shown(movedRows(at(text, 1), wrapping, true, false)),
      at(text, 4),
    );
    assert.deepStrictEqual(
      shown(movedRows(at(text, 4), wrapping, true, true)),
      at(text, 7, 4),
    );
    assert.deepStrictEqual(
      shown(movedRows(at(text, 1), wrapping, false, false)),
      at(text, 0),
    );
    assert.deepStrictEqual(
      shown(movedRows(at(text, 10), wrapping, true, false)),
      at(text, 11),
    );
    const kept = movedRows(at(text, 2), wrapping, true, false);
    assert.strictEqual(kept.goalColumn, 2);
    assert.deepStrictEqual(
      shown(
        movedRows(
          movedRows(kept, wrapping, true, false),
          wrapping,
          true,
          false,
        ),
      ),
      at(text, 11),
    );
    const end = movedToRowEdge(at(text, 1), wrapping, true, false);
    assert.deepStrictEqual(shown(end), at(text, 3));
    assert.strictEqual(end.assoc, -1);
    assert.deepStrictEqual(
      shown(movedToRowEdge(at(text, 4), wrapping, false, true)),
      at(text, 3, 4),
    );
    assert.deepStrictEqual(
      shown(movedToRowEdge(at(text, 10), wrapping, true, false)),
      at(text, 11),
    );
  });

  test('selects the whole text and gives what is selected', () => {
    assert.deepStrictEqual(shown(allSelected(at('abc', 1))), at('abc', 3, 0));
    assert.strictEqual(selectedText(at('abcd', 3, 1)), 'bc');
  });
});
