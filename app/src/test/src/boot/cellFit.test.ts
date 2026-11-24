import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { draggedTo, fittedSize, screenAt } from '../../../boot/cellFit';
import { gridAround } from '../../../shell/shared/cellGrid';

const grid = {
  cell: { width: 10, height: 20 },
  around: { width: 30, height: 50 },
  scale: 1,
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

  test('fits the window by the screen the page lays out at a fractional scale, a CSS pixel larger than the window rounded up, so the screen is whole cells at every step of a drag at 125% rather than a pixel off at every other one', () => {
    const scaled = gridAround(
      { cell: { width: 9, height: 22 }, screen: { width: 1746, height: 1078 } },
      { width: 1777, height: 1128 },
      1.25,
    );
    assert.ok(scaled);
    const screens = Array.from({ length: 60 }, (_, step) => {
      const dragged = draggedTo(
        { left: 0, top: 0, right: 1700 + step * 3, bottom: 1000 + step * 5 },
        'bottomRight',
        { width: 0, height: 0 },
        scaled,
      );
      return [
        screenAt(dragged.right, scaled.around.width, 1.25) % 9,
        screenAt(dragged.bottom, scaled.around.height, 1.25) % 22,
      ];
    });
    assert.deepStrictEqual(new Set(screens.flat()), new Set([0]));
    const fitted = fittedSize({ width: 1790, height: 1140 }, scaled);
    assert.deepStrictEqual(
      [
        screenAt(fitted.width, scaled.around.width, 1.25) % 9,
        screenAt(fitted.height, scaled.around.height, 1.25) % 22,
        fitted.width <= 1790 && fitted.height <= 1140,
      ],
      [0, 0, true],
    );
  });

  test('takes the smallest of the window sizes that lay the page out alike, so a drag never stops on a size a pixel from one that shows the same, as 1536 and 1537 pixels showed one screen at 125%', () => {
    const scaled = gridAround(
      { cell: { width: 9, height: 22 }, screen: { width: 1746, height: 1078 } },
      { width: 1777, height: 1128 },
      1.25,
    );
    assert.ok(scaled);
    const widths = new Set(
      Array.from(
        { length: 200 },
        (_, step) =>
          draggedTo(
            { left: 0, top: 0, right: 1500 + step, bottom: 1000 },
            'right',
            { width: 0, height: 0 },
            scaled,
          ).right,
      ),
    );
    const sorted = [...widths].toSorted((one, other) => one - other);
    assert.deepStrictEqual(
      sorted.filter(
        (width, at) => at > 0 && width - (sorted[at - 1] ?? 0) === 1,
      ),
      [],
    );
  });

  test('fits the window to a size Electron can give it where it sizes a window in whole points, an even number of device pixels at 2x, as resizing it in the middle of a call of Objective-C ran the resize events of Electron inside that call and ended the app', () => {
    const doubled = { ...grid, cell: { width: 17, height: 35 }, scale: 2 };
    const fitted = fittedSize(
      { width: 401, height: 301 },
      doubled,
      undefined,
      2,
    );
    assert.deepStrictEqual(
      [
        fitted.width % 2,
        fitted.height % 2,
        (fitted.width - 30) % 17,
        (fitted.height - 50) % 35,
      ],
      [0, 0, 0, 0],
    );
  });
});
