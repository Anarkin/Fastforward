import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  offsetIn,
  typedLayout,
} from '../../../../../tools/canvas/page/typedLayout';
import type { Board } from '../../../../../tools/canvas/shared/board';

const unit = { width: 7, height: 18 };

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

suite('Canvas typed layout', () => {
  test('lays the text typed out in the node, inside its border and padding, scrolled so the row of the caret is the last shown once it is below them', () => {
    const typed = (head: number) =>
      typedLayout(board, unit, () => 1, {
        id: 'note',
        text: 'ab cd ef gh ij',
        head,
      });
    assert.deepStrictEqual(typed(0)?.area, {
      column: 4,
      row: 2,
      columns: 5,
      rows: 2,
    });
    assert.strictEqual(typed(0)?.rows.length, 3);
    assert.strictEqual(typed(4)?.scroll, 0);
    assert.strictEqual(typed(14)?.scroll, 1);
    assert.strictEqual(
      typedLayout(board, unit, () => 1, { id: 'gone', text: '', head: 0 }),
      undefined,
    );
  });

  test('takes a cell pressed in the node for the place in the text under it, the rows above and below it for the first and the last', () => {
    const layout = typedLayout(board, unit, () => 1, {
      id: 'note',
      text: 'ab cd ef gh ij',
      head: 14,
    });
    assert.ok(layout !== undefined);
    assert.strictEqual(offsetIn(layout, { column: 5, row: 2 }), 7);
    assert.strictEqual(offsetIn(layout, { column: 4, row: 3 }), 12);
    assert.strictEqual(offsetIn(layout, { column: 2, row: 0 }), 0);
    assert.strictEqual(offsetIn(layout, { column: 20, row: 9 }), 14);
  });
});
