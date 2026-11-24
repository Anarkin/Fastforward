import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { cellsChanged } from '../../../boot/cellsChanged';

const report = (width: number, height: number) => ({
  cell: { width, height },
  screen: { width: width * 80, height: height * 24 },
});

suite('Cells changed', () => {
  test('fits a window once for each size of its cells, rather than at every report, as a window Electron sizes in whole points at a fractional scale missed the pixels asked for and fitted again and again', () => {
    const changed = cellsChanged();
    const one = {};
    const other = {};
    assert.deepStrictEqual(
      [
        changed(one, report(9, 18)),
        changed(one, { ...report(9, 18), screen: { width: 1, height: 1 } }),
        changed(other, report(9, 18)),
        changed(one, report(10, 20)),
        changed(one, report(9, 18)),
        changed(one, undefined),
      ],
      [true, false, true, true, true, false],
    );
  });
});
