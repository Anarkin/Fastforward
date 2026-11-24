import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { cellReportOf, gridAround } from '../../../../shell/shared/cellGrid';

const report = {
  cell: { width: 9, height: 22 },
  screen: { width: 1710, height: 1056 },
};

suite('Cell grid', () => {
  test('takes the cell and the screen of the terminal the page reports in whole device pixels', () => {
    assert.deepStrictEqual(cellReportOf(report), report);
  });

  test('refuses what is no report, as the page is not trusted: no cell, a cell of no pixels or of a part of one, a screen of no pixels, a size past any screen, or none at all', () => {
    for (const refused of [
      undefined,
      null,
      'report',
      { cell: report.cell },
      { ...report, cell: { width: 0, height: 22 } },
      { ...report, cell: { width: 9.5, height: 22 } },
      { ...report, screen: { width: 0, height: 1056 } },
      { ...report, screen: { width: 1710, height: 70_000 } },
      { ...report, cell: { width: '9', height: 22 } },
    ]) {
      assert.strictEqual(
        cellReportOf(refused),
        undefined,
        JSON.stringify(refused),
      );
    }
  });

  test('takes the room around the screen from the client area of the window rather than the page, as Chromium lays a page out to a whole CSS pixel rounded up, a device pixel larger than its window at 125% but where the window is a multiple of 5 pixels, and none from a screen larger than the window', () => {
    assert.deepStrictEqual(gridAround(report, { width: 1744, height: 1107 }), {
      cell: report.cell,
      around: { width: 34, height: 51 },
      scale: 1,
    });
    assert.deepStrictEqual(
      gridAround(report, { width: 1744, height: 1107 }, 1.25),
      {
        cell: report.cell,
        around: { width: 1745 - 1710, height: 1108 - 1056 },
        scale: 1.25,
      },
    );
    assert.strictEqual(
      gridAround(report, { width: 1700, height: 1107 }),
      undefined,
    );
  });
});
