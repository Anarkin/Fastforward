import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  dragged,
  originOf,
  snapped,
  wheelMove,
} from '../../../../../tools/canvas/page/pan';

const cell = { width: 7, height: 18 };

const view = { width: 700, height: 540 };

const none = { column: 0, row: 0 };

const notch = { deltaX: 0, deltaY: 100, deltaMode: 0, wheelDeltaY: -120 };

suite('Canvas pan', () => {
  test('starts a canvas two columns and a row left and above its nodes, so their borders stand clear of the edges of the view', () => {
    assert.deepStrictEqual(
      originOf({ column: -3, row: 4, columns: 10, rows: 3 }),
      { column: -5, row: 3 },
    );
    assert.deepStrictEqual(originOf(undefined), none);
  });

  test('moves the canvas with the pointer dragged, a cell for every cell of the way, the place it shows at the opposite way', () => {
    assert.deepStrictEqual(
      dragged(
        { column: 10, row: 5 },
        { x: 100, y: 100 },
        { x: 65, y: 136 },
        cell,
      ),
      { column: 15, row: 3 },
    );
  });

  test('settles on the whole cell nearest where a drag let go', () => {
    assert.deepStrictEqual(snapped({ column: 2.4, row: -1.6 }), {
      column: 2,
      row: -2,
    });
  });

  test('moves the canvas down by the rows of a notch of the wheel and across with Shift, whole cells to glide to, as every list of the app scrolls', () => {
    assert.deepStrictEqual(wheelMove(notch, cell, view, 3, false), {
      by: { column: 0, row: 3 },
      notched: true,
    });
    assert.deepStrictEqual(wheelMove(notch, cell, view, 3, true), {
      by: { column: 3, row: 0 },
      notched: true,
    });
  });

  test('moves the canvas both ways at once by a touchpad, by the part of a cell it strokes, to settle once it rests', () => {
    assert.deepStrictEqual(
      wheelMove({ deltaX: -14, deltaY: 9, deltaMode: 0 }, cell, view, 3, false),
      { by: { column: -2, row: 0.5 }, notched: false },
    );
  });

  test('moves the canvas by the lines or pages a wheel gives in lines or pages, in whole cells', () => {
    assert.deepStrictEqual(
      wheelMove({ deltaX: 0, deltaY: 2, deltaMode: 1 }, cell, view, 3, false),
      { by: { column: 0, row: 2 }, notched: true },
    );
    assert.deepStrictEqual(
      wheelMove({ deltaX: 0, deltaY: 1, deltaMode: 2 }, cell, view, 3, false),
      { by: { column: 0, row: 30 }, notched: true },
    );
  });
});
