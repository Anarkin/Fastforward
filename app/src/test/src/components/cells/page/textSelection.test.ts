import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  breakSelected,
  isEmpty,
  keptText,
  lineAt,
  ordered,
  selectedIn,
  selectedText,
  wordAt,
} from '../../../../../components/cells/page/textSelection';

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

  test('says the line break after a row is selected in every row the selection runs on from into the text after it, the one it starts in too, and not in the one it ends in, nor in the row before the one it ends at the start of, as the browser marked none there', () => {
    const selection = { anchor: from(17, 1), focus: from(6, 2) };

    assert.deepStrictEqual(
      rows.map((row) => breakSelected(selection, row)),
      [false, true, true, false],
    );
    assert.deepStrictEqual(
      rows.map((row) =>
        breakSelected({ anchor: from(0, 2), focus: from(13, 0) }, row),
      ),
      [true, false, false, false],
    );
    assert.strictEqual(breakSelected(undefined, rows[1]), false);
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

  test('selects the whole character a double click is on where there is no word, an emoji or a letter with its accent alike, rather than half of it', () => {
    const pig = String.fromCodePoint(0x1f437);
    assert.deepStrictEqual(wordAt({ start: 0, text: `a ${pig} b` }, 2), {
      anchor: from(0, 2),
      focus: from(0, 4),
    });
    assert.deepStrictEqual(wordAt({ start: 0, text: '(́)' }, 0), {
      anchor: from(0, 0),
      focus: from(0, 2),
    });
  });

  test('keeps a double and a triple click within the text a line ends after, leaving out its carriage return with its line feed, and copies a selection running past the line with the whole line ending the file has', () => {
    const windows = { start: 0, end: 5, text: 'one\r' };

    assert.deepStrictEqual(wordAt(windows, 3), {
      anchor: from(0, 0),
      focus: from(0, 3),
    });
    assert.deepStrictEqual(lineAt(windows), {
      anchor: from(0, 0),
      focus: from(0, 3),
    });
    assert.deepStrictEqual(wordAt({ start: 0, text: '\r' }, 0), {
      anchor: from(0, 0),
      focus: from(0, 0),
    });
    assert.strictEqual(
      selectedText({ anchor: from(0, 1), focus: from(5, 2) }, [
        { ...windows, ending: '␊' },
        { start: 5, end: 8, text: 'two' },
      ]),
      'ne\r\ntw',
    );
  });

  test('copies a line ended by a carriage return alone as it ends, with no line feed after it, as the row it ends holds the carriage return and no line feed follows', () => {
    assert.strictEqual(
      selectedText({ anchor: from(0, 0), focus: from(4, 1) }, [
        { start: 0, end: 2, text: 'a\r' },
        { start: 2, end: 4, text: 'b\r', ending: '␊' },
        { start: 4, end: 5, text: 'c' },
      ]),
      'a\rb\r\nc',
    );
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

  test('reads the text of a selection from the rows held while they hold all of it, and works it out from the text it had before once they hold only where it ended and where it ends now, added to it as it grows and cut from it as it shrinks, whichever way it was dragged, as a view that holds a part of its text can read no more of it', () => {
    const forward = { anchor: from(0, 3), focus: from(6, 2) };
    const backward = { anchor: from(17, 2), focus: from(13, 1) };

    assert.strictEqual(keptText(undefined, forward, rows), 'st\nse');
    assert.strictEqual(
      keptText(
        { selection: forward, text: 'st\nse' },
        { anchor: from(0, 3), focus: from(17, 1) },
        rows.slice(1),
      ),
      'st\nsecond\nthir',
    );
    assert.strictEqual(
      keptText(
        { selection: forward, text: 'st\nse' },
        { anchor: from(0, 3), focus: from(6, 1) },
        rows.slice(1),
      ),
      'st\ns',
    );
    assert.strictEqual(
      keptText(
        { selection: backward, text: 'hird' },
        { anchor: from(17, 2), focus: from(6, 3) },
        rows.slice(0, 3),
      ),
      'ond\nthird',
    );
    assert.strictEqual(
      keptText(
        { selection: backward, text: 'hird' },
        { anchor: from(17, 2), focus: from(13, 2) },
        rows.slice(0, 3),
      ),
      'ird',
    );
  });

  test('keeps the text a selection had while it is the same and none of it is held, and knows none for one that began elsewhere or moved over rows held no longer', () => {
    const kept = {
      selection: { anchor: from(0, 3), focus: from(6, 2) },
      text: 'st\nse',
    };

    assert.strictEqual(keptText(kept, kept.selection, []), 'st\nse');
    assert.strictEqual(keptText(kept, kept.selection, rows.slice(2)), 'st\nse');
    assert.strictEqual(
      keptText(undefined, kept.selection, rows.slice(1)),
      undefined,
    );
    assert.strictEqual(
      keptText(kept, { anchor: from(0, 2), focus: from(13, 1) }, rows.slice(1)),
      undefined,
    );
    assert.strictEqual(
      keptText(kept, { anchor: from(0, 3), focus: from(17, 1) }, rows.slice(2)),
      undefined,
    );
  });
});
