import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  offsetIn,
  typedLayout,
} from '../../../../../tools/canvas/page/typedLayout';
import type { Board } from '../../../../../tools/canvas/shared/board';

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

  test('takes a cell pressed in the node for the place in the text under it, the rows above and below it for the first and the last', () => {
    const layout = typed(14);
    assert.ok(layout !== undefined);
    assert.strictEqual(offsetIn(layout, { column: 5, row: 2 }), 10);
    assert.strictEqual(offsetIn(layout, { column: 4, row: 3 }), 12);
    assert.strictEqual(offsetIn(layout, { column: 2, row: 0 }), 3);
    assert.strictEqual(offsetIn(layout, { column: 20, row: 9 }), 14);
  });
});
