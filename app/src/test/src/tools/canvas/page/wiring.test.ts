import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  hoveredAt,
  markAt,
  marksOf,
  nearestSide,
} from '../../../../../tools/canvas/page/wiring';
import type { Board } from '../../../../../tools/canvas/shared/board';

const unit = { width: 7, height: 18 };

const placed = (
  column: number,
  row: number,
  columns: number,
  rows: number,
) => ({
  x: column * unit.width,
  y: row * unit.height,
  width: columns * unit.width,
  height: rows * unit.height,
});

const board: Board = {
  nodes: [
    { id: 'g', type: 'group', ...placed(0, 0, 30, 12) },
    { id: 'a', type: 'text', text: 'a', ...placed(4, 3, 10, 5) },
  ],
  edges: [],
};

suite('Canvas wiring', () => {
  test('takes the node under the pointer or a cell beside it for the one hovered, the topmost, and a group only near its border', () => {
    assert.strictEqual(hoveredAt(board, unit, { column: 5, row: 4 })?.id, 'a');
    assert.strictEqual(hoveredAt(board, unit, { column: 3, row: 5 })?.id, 'a');
    assert.strictEqual(
      hoveredAt(board, unit, { column: 20, row: 6 }),
      undefined,
    );
    assert.strictEqual(hoveredAt(board, unit, { column: 29, row: 6 })?.id, 'g');
    assert.strictEqual(
      hoveredAt(board, unit, { column: 31, row: 6 }),
      undefined,
    );
  });

  test('marks the cells beside the middle of each side, where an edge leaves it, and finds the mark under the pointer', () => {
    const box = { column: 4, row: 3, columns: 10, rows: 5 };
    assert.deepStrictEqual(
      marksOf('a', box).map(({ side, cell }) => [side, cell.column, cell.row]),
      [
        ['top', 8, 2],
        ['right', 14, 5],
        ['bottom', 8, 8],
        ['left', 3, 5],
      ],
    );
    assert.deepStrictEqual(markAt(board, unit, { column: 14, row: 5 }), {
      id: 'a',
      side: 'right',
      cell: { column: 14, row: 5 },
    });
    assert.strictEqual(markAt(board, unit, { column: 14, row: 4 }), undefined);
  });

  test('takes the side whose mark is nearest the pointer for the end of an edge', () => {
    const box = { column: 4, row: 3, columns: 10, rows: 5 };
    assert.strictEqual(nearestSide(box, { column: 12, row: 4 }, unit), 'right');
    assert.strictEqual(nearestSide(box, { column: 8, row: 3 }, unit), 'top');
    assert.strictEqual(nearestSide(box, { column: 4, row: 5 }, unit), 'left');
    assert.strictEqual(nearestSide(box, { column: 8, row: 7 }, unit), 'bottom');
  });
});
