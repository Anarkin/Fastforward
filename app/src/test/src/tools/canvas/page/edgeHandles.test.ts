import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { endAt } from '../../../../../tools/canvas/page/edgeHandles';
import { boxOf } from '../../../../../tools/canvas/page/grid';
import { routeOf } from '../../../../../tools/canvas/page/routes';
import type {
  Board,
  BoardNode,
} from '../../../../../tools/canvas/shared/board';

const unit = { width: 7, height: 18 };

const text = (id: string, column: number): BoardNode => ({
  id,
  type: 'text',
  text: id,
  x: column * unit.width,
  y: 0,
  width: 10 * unit.width,
  height: 4 * unit.height,
});

const [a, b] = [text('a', 0), text('b', 30)];

const board: Board = {
  nodes: [a, b],
  edges: [
    { id: 'ab', fromNode: 'a', fromSide: 'right', toNode: 'b', toSide: 'left' },
  ],
};

suite('Canvas edge handles', () => {
  test('takes a press on the first or the last cell of the way of an edge selected for that end of it, and none on an edge not selected or between its ends', () => {
    const route = routeOf(
      boxOf(a, unit),
      boxOf(b, unit),
      unit,
      'right',
      'left',
    );
    const middle = route.cells[Math.floor(route.cells.length / 2)];
    assert.ok(middle !== undefined);
    assert.deepStrictEqual(endAt(board, unit, route.from, ['ab']), {
      id: 'ab',
      end: 'from',
    });
    assert.deepStrictEqual(endAt(board, unit, route.to, ['ab']), {
      id: 'ab',
      end: 'to',
    });
    assert.strictEqual(endAt(board, unit, route.to, []), undefined);
    assert.strictEqual(endAt(board, unit, middle, ['ab']), undefined);
  });
});
