import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  gridWithin,
  layoutGrid,
} from '../../../../../tools/terminal/page/grid';

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

  test('takes the cell on whole device pixels, as the cells are drawn, rather than from the width xterm.js rounds its screen to, which made a screen of 190 cells hold 189 at 125%', () => {
    assert.deepStrictEqual(
      gridWithin(
        { width: 1368, height: 809.6 },
        { width: 1361, height: 809.6 },
        { columns: 189, rows: 46 },
        1.25,
      ),
      { columns: 190, rows: 46 },
    );
  });

  test('sizes the terminal once from the cell it draws, rather than first to what the fit of xterm.js proposes from its rounded widths, a column short of a screen of whole cells, which resized it twice and dropped the text selected each time it was shown again; the proposal only while nothing is drawn yet', () => {
    const screen = { width: 1368, height: 809.6 };
    const proposed = { columns: 189, rows: 46 };
    assert.deepStrictEqual(
      layoutGrid(
        screen,
        { width: 1368, height: 809.6 },
        { columns: 190, rows: 46 },
        proposed,
        1.25,
      ),
      { columns: 190, rows: 46 },
    );
    assert.deepStrictEqual(
      layoutGrid(
        screen,
        { width: 0, height: 0 },
        { columns: 80, rows: 24 },
        proposed,
        1.25,
      ),
      proposed,
    );
    assert.deepStrictEqual(
      layoutGrid(
        screen,
        { width: 0, height: 0 },
        { columns: 80, rows: 24 },
        undefined,
        1.25,
      ),
      { columns: 80, rows: 24 },
    );
  });

  test('takes the grid from the cell the renderer draws in whole device pixels where it is known, from the first layout on, before anything is drawn, so a terminal shown again is sized once to the grid it was left at', () => {
    assert.deepStrictEqual(
      layoutGrid(
        { width: 1368, height: 809.6 },
        { width: 0, height: 0 },
        { columns: 80, rows: 24 },
        { columns: 189, rows: 45 },
        1.25,
        { width: 7.2, height: 17.6 },
      ),
      { columns: 190, rows: 46 },
    );
  });

  test('takes a row or a column a hair larger than the screen holds as fitting it, as the DOM renderer draws a row 17.6042 pixels high where 22 device pixels are 17.6 at 125%, so a screen of 48 rows held 47 once drawn though the fit proposed 48, and resized twice', () => {
    assert.deepStrictEqual(
      gridWithin(
        { width: 1368, height: 844.8 },
        { width: 1368, height: 47 * 17.6042 },
        { columns: 190, rows: 47 },
      ),
      { columns: 190, rows: 48 },
    );
  });
});
