import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  isEmpty,
  lineAt,
  ordered,
  selectedIn,
  selectedText,
  wordAt,
} from '../../../../../tools/viewer/page/textSelection';

const rows = [
  { start: 0, end: 6, text: 'first' },
  { start: 6, end: 13, text: 'second' },
  { start: 13, end: 17, text: 'thi', cut: true as const },
  { start: 17, end: 20, text: 'rd' },
];

const from = (start: number, char: number) => ({ start, char });

suite('Text selected in a file viewed', () => {
  test('orders a selection dragged backwards, by row and then by character, and says when nothing is selected', () => {
    assert.deepStrictEqual(ordered({ anchor: from(6, 2), focus: from(0, 4) }), {
      first: from(0, 4),
      last: from(6, 2),
    });
    assert.deepStrictEqual(ordered({ anchor: from(6, 4), focus: from(6, 1) }), {
      first: from(6, 1),
      last: from(6, 4),
    });
    assert.strictEqual(
      isEmpty({ anchor: from(6, 1), focus: from(6, 1) }),
      true,
    );
    assert.strictEqual(
      isEmpty({ anchor: from(6, 1), focus: from(6, 2) }),
      false,
    );
  });

  test('tells which characters of a row are selected: from where the selection starts in its first row, whole in the rows between, to where it ends in its last, within what the row shows', () => {
    const selection = { anchor: from(0, 3), focus: from(13, 2) };
    const whole = { from: 0, to: 6 };

    assert.deepStrictEqual(selectedIn(selection, rows[0], whole), {
      from: 3,
      to: 6,
    });
    assert.deepStrictEqual(selectedIn(selection, rows[1], whole), whole);
    assert.deepStrictEqual(selectedIn(selection, rows[1], { from: 2, to: 4 }), {
      from: 2,
      to: 4,
    });
    assert.deepStrictEqual(selectedIn(selection, rows[2], whole), {
      from: 0,
      to: 2,
    });
    assert.strictEqual(selectedIn(selection, rows[3], whole), undefined);
    assert.strictEqual(selectedIn(undefined, rows[0], whole), undefined);
    assert.strictEqual(
      selectedIn({ anchor: from(0, 5), focus: from(6, 0) }, rows[0], {
        from: 0,
        to: 5,
      }),
      undefined,
    );
  });

  test('selects the word a double click is on, or the one character under it where there is no word, and the whole row on a triple click', () => {
    const row = { start: 6, text: 'a wide-open door' };

    assert.deepStrictEqual(wordAt(row, 4), {
      anchor: from(6, 2),
      focus: from(6, 6),
    });
    assert.deepStrictEqual(wordAt(row, 6), {
      anchor: from(6, 2),
      focus: from(6, 6),
    });
    assert.deepStrictEqual(wordAt({ start: 6, text: 'a  b' }, 2), {
      anchor: from(6, 2),
      focus: from(6, 3),
    });
    assert.deepStrictEqual(lineAt(row), {
      anchor: from(6, 0),
      focus: from(6, 16),
    });
  });

  test('copies what is selected with a line break after each row it runs past, but none after a row its line goes on from, whichever way it was dragged', () => {
    assert.strictEqual(
      selectedText({ anchor: from(0, 3), focus: from(17, 1) }, rows),
      'st\nsecond\nthir',
    );
    assert.strictEqual(
      selectedText({ anchor: from(6, 4), focus: from(6, 1) }, rows),
      'eco',
    );
    assert.strictEqual(
      selectedText({ anchor: from(6, 6), focus: from(13, 0) }, rows),
      '\n',
    );
  });
});
