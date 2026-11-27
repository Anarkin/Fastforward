import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  offsetIn,
  typedLayout,
} from '../../../../../tools/canvas/page/typedLayout';
import type { Board } from '../../../../../tools/canvas/shared/board';
import { screenOf } from '../../../../../tools/canvas/page/boardScreen';
import { screenRows } from '../../../../../tools/canvas/page/seenScreen';

const unit = { width: 7, height: 18 };

const widths = { char: 1, of: () => 1 };

const board: Board = {
  nodes: [
    {
      id: 'note',
      type: 'text',
      text: '',
      x: 2 * unit.width,
      y: unit.height,
      width: 9 * unit.width,
      height: 4 * unit.height,
    },
  ],
  edges: [],
};

const typed = (head: number) =>
  typedLayout(board, unit, widths, {
    id: 'note',
    text: 'ab cd ef gh ij',
    head,
  });

const edged = (label: string): Board => ({
  nodes: [
    { id: 'a', type: 'text', text: '', x: 0, y: 0, width: 56, height: 54 },
    {
      id: 'b',
      type: 'text',
      text: '',
      x: 168,
      y: 0,
      width: 56,
      height: 54,
    },
  ],
  edges: [
    {
      id: 'e',
      fromNode: 'a',
      fromSide: 'right',
      toNode: 'b',
      toSide: 'left',
      label,
    },
  ],
});

suite('Canvas typed layout', () => {
  test('lays the text typed out in the node, inside its border and padding, wrapped as every view wraps a text with a column for a blank hanging at the end of a row and one for the mark of its break, scrolled so the row of the caret is the last shown once it is below them', () => {
    assert.deepStrictEqual(typed(0)?.area, {
      column: 4,
      row: 2,
      columns: 5,
      rows: 2,
      room: 6,
      wrapAt: 4,
    });
    assert.deepStrictEqual(
      typed(0)?.rows.map(({ row, from, to }) => row.text.slice(from, to)),
      ['ab ', 'cd ', 'ef ', 'gh ', 'ij'],
    );
    assert.strictEqual(typed(4)?.scroll, 0);
    assert.strictEqual(typed(14)?.scroll, 3);
    assert.strictEqual(
      typedLayout(board, unit, widths, { id: 'gone', text: '', head: 0 }),
      undefined,
    );
  });

  test('lays the label typed on an edge out on the row and the columns its label is drawn on, halfway along the edge and centered there as it is typed', () => {
    for (const label of ['to', 'calls it']) {
      const rows = screenRows(
        screenOf({
          board: edged(label),
          unit,
          view: { column: 0, row: 0, columns: 34, rows: 3 },
          widths,
        }),
      );
      const row = rows.findIndex((each) => each.includes(label));
      assert.deepStrictEqual(
        typedLayout(edged(label), unit, widths, {
          id: 'e',
          text: label,
          head: 0,
        })?.area,
        {
          column: rows[row]?.indexOf(label),
          row,
          columns: label.length,
          rows: 1,
          room: label.length,
          wrapAt: undefined,
        },
        label,
      );
    }
  });

  test('takes a cell pressed in the node for the place in the text under it, the rows above and below it for the first and the last', () => {
    const layout = typed(14);
    assert.ok(layout !== undefined);
    assert.strictEqual(offsetIn(layout, { column: 5, row: 2 }), 10);
    assert.strictEqual(offsetIn(layout, { column: 4, row: 3 }), 12);
    assert.strictEqual(offsetIn(layout, { column: 2, row: 0 }), 3);
    assert.strictEqual(offsetIn(layout, { column: 20, row: 9 }), 14);
  });

  test('takes a cell pressed in a group label scrolled sideways for the place in the text drawn there, as the label scrolls to keep the cursor in its border', () => {
    const grouped: Board = {
      nodes: [
        {
          id: 'g',
          type: 'group',
          x: 0,
          y: 0,
          width: 10 * unit.width,
          height: 3 * unit.height,
          label: 'Long plan',
        },
      ],
      edges: [],
    };
    const layout = typedLayout(grouped, unit, widths, {
      id: 'g',
      text: 'Long plan',
      head: 9,
    });
    assert.ok(layout !== undefined);
    assert.deepStrictEqual(
      [3, 4, 6].map((column) => offsetIn(layout, { column, row: 0 })),
      [5, 6, 8],
    );
  });
});
