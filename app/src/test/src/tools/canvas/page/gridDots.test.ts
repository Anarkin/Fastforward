import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { screenOf } from '../../../../../tools/canvas/page/boardScreen';
import { gridDots } from '../../../../../tools/canvas/page/gridDots';
import type { Screen } from '../../../../../tools/canvas/page/screen';
import type { BoardNode } from '../../../../../tools/canvas/shared/board';

const unit = { width: 7, height: 18 };

function picture(screen: Screen): string[] {
  const dots = new Set(
    gridDots(screen).map(({ column, row }) => `${column},${row}`),
  );
  return Array.from({ length: screen.rows + 1 }, (_row, row) =>
    Array.from({ length: screen.columns + 1 }, (_column, column) =>
      dots.has(`${column},${row}`) ? '+' : ' ',
    ).join(''),
  );
}

const shown = (nodes: readonly BoardNode[]) =>
  screenOf({
    board: { nodes, edges: [] },
    unit,
    view: { column: 0, row: 0, columns: 8, rows: 5 },
    cellsOf: () => 1,
  });

suite('Canvas grid dots', () => {
  test('marks every corner of the cells of an empty canvas, the corners its cells share once', () => {
    assert.deepStrictEqual(picture(shown([])), Array(6).fill('+++++++++'));
  });

  test('marks no corner inside a node, as a node is drawn over the grid, but the corners around it, and every corner inside a group, which is drawn see-through', () => {
    const node: BoardNode = {
      id: 'a',
      type: 'text',
      text: '',
      x: 14,
      y: 18,
      width: 28,
      height: 54,
    };
    assert.deepStrictEqual(picture(shown([node])), [
      '+++++++++',
      '+++++++++',
      '+++   +++',
      '+++   +++',
      '+++++++++',
      '+++++++++',
    ]);
    const group: BoardNode = {
      id: 'g',
      type: 'group',
      x: 14,
      y: 18,
      width: 28,
      height: 54,
    };
    assert.deepStrictEqual(picture(shown([group])), Array(6).fill('+++++++++'));
  });
});
