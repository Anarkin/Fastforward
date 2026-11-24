import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { gridWithin } from '../../../../../tools/terminal/page/grid';

suite('Terminal grid', () => {
  test('fills the screen with as many whole cells as fit, the cell taken from what is drawn, leaving less than a cell at the right and the bottom, as the fit of xterm.js kept 14 pixels for a scrollbar the app hides', () => {
    assert.deepStrictEqual(
      gridWithin(
        { width: 1236, height: 622 },
        { width: 1224, height: 612 },
        { columns: 170, rows: 34 },
      ),
      { columns: 171, rows: 34 },
    );
  });

  test('takes a screen a whole number of cells wide as that many, though its width is a sum of fractions a hair short', () => {
    assert.deepStrictEqual(
      gridWithin(
        { width: 7.2 * 100 - 1e-9, height: 17.6 * 10 },
        { width: 7.2 * 90, height: 17.6 * 10 },
        { columns: 90, rows: 10 },
      ),
      { columns: 100, rows: 10 },
    );
  });

  test('keeps the grid it has while nothing is drawn yet to take the cell from', () => {
    assert.deepStrictEqual(
      gridWithin(
        { width: 500, height: 300 },
        { width: 0, height: 0 },
        { columns: 80, rows: 24 },
      ),
      { columns: 80, rows: 24 },
    );
  });
});
