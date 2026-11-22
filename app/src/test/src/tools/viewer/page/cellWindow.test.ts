import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { cellWindow, holds } from '../../../../../tools/viewer/page/cellWindow';

const cell = { advance: 8, rowHeight: 20 };

const margin = { rows: 10, columns: 20 };

const shown = { left: 0, top: 100, right: 800, bottom: 500 };

suite('Cells of a block in sight', () => {
  test('takes the rows and the columns of a block that are in sight and some around them, so a scroll finds them drawn, and no more than the block has', () => {
    assert.deepStrictEqual(
      cellWindow(
        { left: 40, top: -900, rows: 400, columns: 300 },
        cell,
        shown,
        margin,
      ),
      { row: 40, rows: 40, column: 0, columns: 115 },
    );
    assert.deepStrictEqual(
      cellWindow(
        { left: 40, top: 300, rows: 5, columns: 30 },
        cell,
        shown,
        margin,
      ),
      { row: 0, rows: 5, column: 0, columns: 30 },
    );
  });

  test('takes the columns in sight of a block scrolled sideways under what shows it, from the first of them', () => {
    assert.deepStrictEqual(
      cellWindow(
        { left: -1600, top: 200, rows: 3, columns: 1000 },
        cell,
        shown,
        margin,
      ),
      { row: 0, rows: 3, column: 180, columns: 140 },
    );
  });

  test('takes nothing of a block out of sight, above, below or beside what shows it, so it holds no canvas', () => {
    for (const block of [
      { left: 40, top: -900, rows: 10, columns: 30 },
      { left: 40, top: 900, rows: 10, columns: 30 },
      { left: 2000, top: 200, rows: 10, columns: 30 },
    ]) {
      assert.strictEqual(cellWindow(block, cell, shown, margin), undefined);
    }
  });

  test('says a window still holds what is in sight until a row or a column outside it comes into sight, so a scroll within what is drawn draws nothing anew', () => {
    const drawn = { row: 40, rows: 40, column: 0, columns: 115 };
    const block = { left: 40, rows: 400, columns: 300 };

    assert.deepStrictEqual(
      [-900, -1000, -1120].map((top) =>
        holds(drawn, { ...block, top }, cell, shown),
      ),
      [true, true, false],
    );
    assert.strictEqual(
      holds(undefined, { ...block, top: -900 }, cell, shown),
      false,
    );
  });
});
