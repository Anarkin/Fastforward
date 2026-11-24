import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { fitToward, fitsWhenMoved } from '../../../boot/cellsChanged';

const report = (width: number, height: number) => ({
  cell: { width, height },
  screen: { width: width * 80, height: height * 24 },
});

suite('Cells changed', () => {
  test('fits a window again once its cells or its size changed since it was last fitted, but not at a report of the size the fit left it at, as a window Electron sizes in whole points at a fractional scale missed the pixels asked for and was fitted again and again', () => {
    const fits = fitsWhenMoved();
    const one = {};
    const other = {};
    const size = { width: 1000, height: 700 };
    const left = { width: 1001, height: 700 };
    const due = [fits.due(one, report(9, 18), size)];
    fits.done(one, report(9, 18), left);
    due.push(
      fits.due(one, report(9, 18), left),
      fits.due(
        one,
        { ...report(9, 18), screen: { width: 1, height: 1 } },
        left,
      ),
      fits.due(other, report(9, 18), left),
      fits.due(one, report(10, 20), left),
      fits.due(one, report(9, 18), { width: 1011, height: 703 }),
      fits.due(one, undefined, left),
    );
    assert.deepStrictEqual(due, [true, false, false, true, true, true, false]);
  });

  test('fits a window to the nearest whole cells only once its cells changed since it was fitted, and down otherwise, so it never grows past the size it was opened or moved at, nor shrinks by a cell at each change of its cells', () => {
    const toward = fitToward();
    const one = {};
    const small = { width: 9, height: 18 };
    const large = { width: 10, height: 20 };
    assert.deepStrictEqual(
      [
        toward(one, small),
        toward(one, small),
        toward(one, large),
        toward(one, large),
        toward(one, small),
        toward({}, large),
      ],
      ['down', 'down', 'near', 'down', 'near', 'down'],
    );
  });
});
