import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { screenOf } from '../../../../../tools/canvas/page/boardScreen';
import { cornerRects } from '../../../../../tools/canvas/page/gridDots';
import type { Screen } from '../../../../../tools/canvas/page/screen';
import type { BoardNode } from '../../../../../tools/canvas/shared/board';

const unit = { width: 7, height: 18 };
const look = { advance: 4, rowHeight: 4, stroke: 1, shift: { x: 0, y: 0 } };

function pixels(screen: Screen): string[] {
  const width = screen.columns * look.advance;
  const height = screen.rows * look.rowHeight;
  const drawn = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => '.'),
  );
  for (const rect of cornerRects(screen, look)) {
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let x = rect.x; x < rect.x + rect.width; x++) {
        const row = drawn[y];
        if (row !== undefined && x >= 0 && x < width) {
          row[x] = '#';
        }
      }
    }
  }
  return drawn.map((row) => row.join(''));
}

const columnOf = (rows: readonly string[], x: number) =>
  rows.map((row) => row[x]).join('');

const shown = (nodes: readonly BoardNode[], columns = 3, rows = 3) =>
  screenOf({
    board: { nodes, edges: [] },
    unit,
    view: { column: 0, row: 0, columns, rows },
    widths: { char: 1, of: () => 1 },
  });

suite('Canvas grid dots', () => {
  test('marks every corner of every cell with a pixel of its own, inside the cell, the four where cells meet drawn as one block', () => {
    assert.deepStrictEqual(pixels(shown([], 2, 2)), [
      '#..##..#',
      '........',
      '........',
      '#..##..#',
      '#..##..#',
      '........',
      '........',
      '#..##..#',
    ]);
    const rects = cornerRects(shown([], 3, 3), look);
    assert.ok(
      rects.some(
        ({ x, y, width, height }) =>
          x === 3 && y === 3 && width === 2 && height === 2,
      ),
    );
    assert.ok(rects.length < 3 * 3 * 4);
  });

  test('marks the corners of the cells around a node and those of its border cells outside its border line, so the dots along a node are as whole as anywhere, and none inside it, nor inside one node under another, and every corner inside a group, which is drawn see-through', () => {
    const node: BoardNode = {
      id: 'a',
      type: 'text',
      text: '',
      x: 7,
      y: 18,
      width: 21,
      height: 54,
    };
    const empty = pixels(shown([], 5, 5));
    const around = pixels(shown([node], 5, 5));
    for (const y of [3, 4, 15, 16]) {
      assert.strictEqual(around[y], empty[y], `row ${y} along the node`);
    }
    for (const x of [3, 4, 15, 16]) {
      assert.strictEqual(
        columnOf(around, x),
        columnOf(empty, x),
        `column ${x}`,
      );
    }
    for (const [x, y] of [
      [8, 8],
      [11, 8],
      [8, 11],
      [11, 11],
      [8, 7],
      [11, 7],
      [7, 8],
      [7, 11],
    ] as const) {
      assert.strictEqual(around[y]?.[x], '.', `${x},${y} inside the node`);
    }
    const over: BoardNode = {
      ...node,
      id: 'b',
      x: 0,
      y: 0,
      width: 35,
      height: 90,
    };
    assert.deepStrictEqual(
      pixels(shown([node, over], 5, 5))
        .slice(4, 16)
        .map((row) => row.slice(4, 16)),
      Array(12).fill('............'),
    );
    const group: BoardNode = { ...node, id: 'g', type: 'group' };
    assert.deepStrictEqual(pixels(shown([group], 5, 5)), empty);
  });
});
