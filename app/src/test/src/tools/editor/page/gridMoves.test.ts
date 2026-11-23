import * as assert from 'node:assert';
import { EditorSelection, Text } from '@codemirror/state';
import { suite, test } from 'vitest';
import {
  cellWidthsOf,
  type TextWidths,
} from '../../../../../lib/page/textWidths';
import { plainCells } from '../../../../../lib/page/cellTable';
import {
  columnIn,
  placeOf,
  rowHolding,
  rowsOf,
} from '../../../../../tools/editor/page/grid';
import {
  cursorsOnLines,
  extended,
  movedRows,
  rowEnd,
  rowStart,
} from '../../../../../tools/editor/page/gridMoves';

const wide: TextWidths = {
  char: 1,
  of: (cluster) => (/[中文]/.test(cluster) ? 2 : 1),
};

const unwrapped = { columns: undefined, widths: cellWidthsOf(plainCells) };

const docOf = (...lines: string[]) => Text.of(lines);

const at = (pos: number, goal?: number) =>
  EditorSelection.cursor(pos, 1, undefined, goal);

suite('The grid the text edited stands on', () => {
  test('finds the row of a wrapped line a place is on, the end of a row or the start of the next as the cursor leans, and its column counted from the indentation its row hangs at, a wide character two', () => {
    const grid = { columns: 10, widths: wide };
    const line = docOf('  alpha beta gamma delta').line(1);
    const rows = rowsOf(grid, line);

    assert.deepStrictEqual(
      rows.map(({ from, to, indent }) => [from, to, indent]),
      [
        [0, 8, 0],
        [8, 13, 2],
        [13, 19, 2],
        [19, 24, 2],
      ],
    );
    assert.deepStrictEqual(
      [
        rowHolding(rows, 8, 1),
        rowHolding(rows, 8, -1),
        rowHolding(rows, 0, -1),
      ],
      [1, 0, 0],
    );
    assert.deepStrictEqual(
      [placeOf(grid, line, 10, 1).row, placeOf(grid, line, 10, 1).column],
      [1, 4],
    );
    const mixed = docOf('a中b').line(1);
    assert.strictEqual(
      columnIn(grid, mixed.text, rowsOf(grid, mixed)[0] ?? rows[0], 2),
      3,
    );
  });

  test('moves the cursor a row up or down to the column it set out from, kept through a shorter line, onto the rows a line wraps onto as onto lines, and to the start or the end of the text past its first or last row', () => {
    const doc = docOf('abcdefgh', 'ab', 'abcdef');

    const down = movedRows(doc, unwrapped, at(6), 1);
    assert.deepStrictEqual([down.head, down.goalColumn], [11, 6]);
    assert.strictEqual(movedRows(doc, unwrapped, down, 1).head, 18);
    assert.strictEqual(movedRows(doc, unwrapped, at(18, 6), -2).head, 6);
    assert.strictEqual(movedRows(doc, unwrapped, at(3), -1).head, 0);
    assert.strictEqual(movedRows(doc, unwrapped, at(14), 1).head, doc.length);

    const grid = { columns: 10, widths: wide };
    const wrapped = docOf('  alpha beta gamma delta', 'end');
    assert.strictEqual(movedRows(wrapped, grid, at(4), 1).head, 10);
    assert.strictEqual(movedRows(wrapped, grid, at(10), 3).head, 28);
    assert.strictEqual(movedRows(wrapped, grid, at(27, 4), -1).head, 21);
  });

  test('takes Home to the start of the row the cursor is on and End to its end, past the blanks hanging there, leaning on that row rather than on the next', () => {
    const grid = { columns: 10, widths: wide };
    const doc = docOf('  alpha beta gamma delta');

    assert.strictEqual(rowStart(doc, grid, at(10)).head, 8);
    const end = rowEnd(doc, grid, at(10));
    assert.deepStrictEqual([end.head, end.assoc], [13, -1]);
    assert.strictEqual(rowStart(doc, grid, end).head, 8);
    const last = rowEnd(doc, grid, at(20));
    assert.deepStrictEqual([last.head, last.assoc], [24, 1]);
  });

  test('extends a selection to where its head moved, keeping its anchor', () => {
    const moved = extended(EditorSelection.range(2, 5), at(9, 3));

    assert.deepStrictEqual(
      [moved.anchor, moved.head, moved.goalColumn],
      [2, 9, 3],
    );
  });
  test('adds a cursor on the line below or above every cursor, in the column of the cells it stands in, a wide character two of them, from a wrapped line onto the first row of the line below or the last of the one above rather than onto a row of its own, and none past the first or the last line, as CodeMirror looked for the row above or below in the text the browser lays out, which wraps elsewhere than the cells', () => {
    const grid = { columns: 10, widths: wide };
    const doc = docOf('alpha beta gamma', '中文中文中文', 'ab');
    const heads = (from: number, by: number) =>
      cursorsOnLines(doc, grid, EditorSelection.single(from), by)?.ranges.map(
        ({ head }) => head,
      );

    assert.deepStrictEqual(heads(4, 1), [4, 17 + 2]);
    assert.deepStrictEqual(heads(13, 1), [13, 17 + 1]);
    assert.deepStrictEqual(heads(17 + 2, -1), [11 + 4, 17 + 2]);
    assert.deepStrictEqual(heads(17 + 2, 1), [17 + 2, 24 + 2]);
    assert.strictEqual(heads(25, 1), undefined);
    assert.strictEqual(heads(3, -1), undefined);

    const two = cursorsOnLines(
      doc,
      { columns: undefined, widths: wide },
      EditorSelection.create([
        EditorSelection.cursor(4),
        EditorSelection.cursor(17 + 2),
      ]),
      1,
    );
    assert.deepStrictEqual(
      two?.ranges.map(({ head }) => head),
      [4, 17 + 2, 24 + 2],
    );
  });
});
