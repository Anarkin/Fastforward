import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { boxOf, unitOf } from '../../../../../tools/canvas/page/grid';

const unit = unitOf(7.2, 18);

suite('Canvas grid', () => {
  test('takes a cell as the cell of the monospace font in whole pixels, as a canvas keeps its places in whole pixels', () => {
    assert.deepStrictEqual(unit, { width: 7, height: 18 });
    assert.deepStrictEqual(unitOf(7.5, 19.5), { width: 8, height: 20 });
    assert.deepStrictEqual(unitOf(0.2, 0.4), { width: 1, height: 1 });
  });

  test('puts a node on the cells its edges are nearest, so nodes that meet in the file meet on the grid', () => {
    const left = boxOf({ x: 0, y: 0, width: 250, height: 60 }, unit);
    const right = boxOf({ x: 250, y: 0, width: 250, height: 60 }, unit);
    assert.deepStrictEqual(left, { column: 0, row: 0, columns: 36, rows: 3 });
    assert.strictEqual(right.column, left.column + left.columns);
    assert.deepStrictEqual(
      boxOf({ x: -237, y: -120, width: 250, height: 60 }, unit),
      { column: -34, row: -7, columns: 36, rows: 4 },
    );
  });

  test('gives a node smaller than a cell one cell, so it is never lost', () => {
    assert.deepStrictEqual(boxOf({ x: 0, y: 120, width: 3, height: 3 }, unit), {
      column: 0,
      row: 7,
      columns: 1,
      rows: 1,
    });
  });
});
