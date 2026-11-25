import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { ShownRows } from '../../../../../components/cells/page/cellPainting';
import {
  heldRows,
  placeUnder,
  pressed,
  reach,
  stillHeld,
  unitUnder,
} from '../../../../../components/cells/page/cellPointing';
import { rowOf, shown } from './cellFixtures';

const advance = 7;

const rowHeight = 16;

const charUnder = (
  rows: ShownRows,
  x: number,
  y: number,
): readonly [number | undefined, number | undefined] => {
  const under = placeUnder(rows, advance, rowHeight, x, y);
  return [under?.place.start, under?.place.char];
};

suite('Text under the pointer', () => {
  test('takes the width of a tab of each row from the widths of its own line, as rows of several files of a diff draw their tabs at the width of each file', () => {
    const tab = String.fromCharCode(9);
    const narrow = rowOf(tab + 'a', 0);
    const wide = rowOf(tab + 'b', 10);
    const rows = shown([narrow, wide], {
      widthsOf: (line) => ({
        char: 1,
        of: () => 1,
        tabSize: line === wide.row ? 8 : 2,
      }),
    });
    const at = (column: number, y: number) =>
      unitUnder(rows, advance, rowHeight, column * advance + 1, y)?.text;

    assert.deepStrictEqual([at(2, 3), at(2, 20), at(8, 20)], ['a', tab, 'b']);
    assert.deepStrictEqual(charUnder(rows, 8 * advance + 1, 20), [10, 1]);
  });

  test('finds the character drawn where the pointer rests and the box of its cells, and nothing past the end of a row, above the rows or below them, as a tooltip names what is drawn there', () => {
    const rows = shown([rowOf('ab\u200bc', 0), rowOf('ef', 5)]);

    assert.deepStrictEqual(unitUnder(rows, advance, rowHeight, 15, 3), {
      text: '\u200b',
      row: rows.rows[0]?.row,
      from: 2,
      key: '0:2',
      left: 14,
      top: 0,
      width: 7,
      height: 16,
    });
    assert.deepStrictEqual(
      unitUnder(rows, advance, rowHeight, 8, 20)?.text,
      'f',
    );
    assert.strictEqual(unitUnder(rows, advance, rowHeight, 15, 20), undefined);
    assert.strictEqual(unitUnder(rows, advance, rowHeight, 3, -1), undefined);
    assert.strictEqual(unitUnder(rows, advance, rowHeight, 3, 40), undefined);
  });

  test('finds the row by how far down the pointer is and the character by how far across, at the edge between two characters nearest to it', () => {
    const rows = shown([rowOf('abcd', 0), rowOf('efgh', 5)]);

    assert.deepStrictEqual(charUnder(rows, 0, 0), [0, 0]);
    assert.deepStrictEqual(charUnder(rows, 3, 0), [0, 0]);
    assert.deepStrictEqual(charUnder(rows, 4, 0), [0, 1]);
    assert.deepStrictEqual(charUnder(rows, 15, 20), [5, 2]);
  });

  test('takes the carriage return a line ends with for the line ending it is part of, the pointer over it or past it at the end of the text before it, so it is never selected on its own, as its line feed is not', () => {
    const rows = shown([rowOf('ab\r', 0), rowOf('cd', 4)]);

    assert.deepStrictEqual(charUnder(rows, 2 * advance + 5, 0), [0, 2]);
    assert.deepStrictEqual(charUnder(rows, 500, 0), [0, 2]);
    assert.deepStrictEqual(charUnder(rows, 500, 20), [4, 2]);
  });

  test('takes a pointer above the rows for the first and below them for the last, and one past the end of a row for its end, so a drag past the text selects up to there', () => {
    const rows = shown([rowOf('abcd', 0), rowOf('ef', 5)]);

    assert.deepStrictEqual(charUnder(rows, 14, -40), [0, 2]);
    assert.deepStrictEqual(charUnder(rows, 500, 400), [5, 2]);
  });

  test('counts a tab to its stop and a wide character as two cells, and from the first column the canvas shows and the column a row scrolled sideways starts at', () => {
    assert.deepStrictEqual(
      charUnder(shown([rowOf('a\tb中c', 0)]), 4 * advance + 1, 0),
      [0, 2],
    );
    assert.deepStrictEqual(
      charUnder(shown([rowOf('a\tb中c', 0)]), 6 * advance + 1, 0),
      [0, 4],
    );
    assert.deepStrictEqual(
      charUnder(
        shown([rowOf('0123456789', 0)], {
          first: 4,
          parts: [{ from: 4, to: 10, column: 4 }],
        }),
        2 * advance,
        0,
      ),
      [0, 6],
    );
  });

  test('starts a selection where a press lands, takes the word on a second click and the row on a third, and reaches from where the selection began on a press with Shift', () => {
    const under = {
      row: { start: 5, end: 12, text: 'one two' },
      place: { start: 5, char: 5 },
    };
    const before = {
      anchor: { start: 0, char: 1 },
      focus: { start: 0, char: 3 },
    };

    assert.deepStrictEqual(pressed(before, under, 1, false), {
      anchor: under.place,
      focus: under.place,
    });
    assert.deepStrictEqual(pressed(before, under, 2, false), {
      anchor: { start: 5, char: 4 },
      focus: { start: 5, char: 7 },
    });
    assert.deepStrictEqual(pressed(before, under, 3, false), {
      anchor: { start: 5, char: 0 },
      focus: { start: 5, char: 7 },
    });
    assert.deepStrictEqual(pressed(before, under, 1, true), {
      anchor: before.anchor,
      focus: under.place,
    });
    assert.deepStrictEqual(pressed(undefined, under, 1, true), {
      anchor: under.place,
      focus: under.place,
    });
  });

  test('knows the rows of text held from the rows of the screen, a wrapped row once, and whether a selection still lies within them', () => {
    const line = rowOf('wrapped line', 0);
    const held = [{ ...line, to: 7 }, { ...line, from: 7 }, rowOf('next', 13)];
    const within = {
      anchor: { start: 0, char: 2 },
      focus: { start: 13, char: 1 },
    };

    assert.deepStrictEqual(
      heldRows(held).map(({ text }) => text),
      ['wrapped line', 'next'],
    );
    assert.strictEqual(stillHeld(within, held), true);
    assert.strictEqual(stillHeld(within, held.slice(2)), false);
    assert.strictEqual(stillHeld(within, []), false);
  });

  test('scrolls a row for every row the pointer is dragged past the top or the bottom, five at most, and none while it is over the text', () => {
    assert.deepStrictEqual(
      [
        reach(100, 480, rowHeight),
        reach(-1, 480, rowHeight),
        reach(-40, 480, rowHeight),
        reach(500, 480, rowHeight),
        reach(2000, 480, rowHeight),
      ],
      [0, -1, -3, 2, 5],
    );
  });
});
