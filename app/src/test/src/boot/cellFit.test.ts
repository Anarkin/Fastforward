import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { draggedTo, fittedSize } from '../../../boot/cellFit';

const grid = {
  cell: { width: 10, height: 20 },
  around: { width: 30, height: 50 },
};

const rect = {
  left: 100,
  top: 200,
  right: 100 + 8 + 30 + 333,
  bottom: 200 + 4 + 50 + 207,
};

const frame = { width: 8, height: 4 };

const room = ({ left, top, right, bottom }: typeof rect) => ({
  width: right - left - frame.width - grid.around.width,
  height: bottom - top - frame.height - grid.around.height,
});

suite('Fitting the window to the cells of the terminal', () => {
  test('rounds the area of a window down to whole cells around the room it keeps for the rest of the page, at least a cell, so the terminal fills its screen to the pixel', () => {
    assert.deepStrictEqual(fittedSize({ width: 363, height: 257 }, grid), {
      width: 360,
      height: 250,
    });
    assert.deepStrictEqual(fittedSize({ width: 360, height: 250 }, grid), {
      width: 360,
      height: 250,
    });
    assert.deepStrictEqual(fittedSize({ width: 31, height: 52 }, grid), {
      width: 40,
      height: 70,
    });
  });

  test('moves the edges of a window dragged to the nearest whole cells, the edge dragged alone and the one across from it kept, so the window resizes in steps of a cell as the Windows console does', () => {
    const fitted = (edges: typeof rect) => {
      const { width, height } = room(edges);
      return [width % grid.cell.width, height % grid.cell.height];
    };
    const right = draggedTo(rect, 'bottomRight', frame, grid);
    assert.deepStrictEqual(fitted(right), [0, 0]);
    assert.deepStrictEqual(right, {
      left: rect.left,
      top: rect.top,
      right: rect.right - 3,
      bottom: rect.bottom - 7,
    });
    const left = draggedTo(rect, 'topLeft', frame, grid);
    assert.deepStrictEqual(fitted(left), [0, 0]);
    assert.deepStrictEqual(left, {
      left: rect.left + 3,
      top: rect.top + 7,
      right: rect.right,
      bottom: rect.bottom,
    });
    assert.deepStrictEqual(draggedTo(rect, 'right', frame, grid), {
      ...rect,
      right: rect.right - 3,
    });
    assert.deepStrictEqual(draggedTo(rect, 'top', frame, grid), {
      ...rect,
      top: rect.top + 7,
    });
  });

  test('rounds up rather than down where down would make the window smaller than it may be, as the system keeps a window at its least size and the window would never fit', () => {
    assert.deepStrictEqual(
      fittedSize({ width: 363, height: 257 }, grid, {
        width: 361,
        height: 251,
      }),
      { width: 370, height: 270 },
    );
    assert.deepStrictEqual(
      draggedTo(rect, 'bottomRight', frame, grid, {
        width: 361,
        height: 251,
      }),
      { ...rect, right: rect.left + 8 + 370, bottom: rect.top + 4 + 270 },
    );
  });
});
