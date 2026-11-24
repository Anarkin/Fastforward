import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { cellReportWithin } from '../../../../shell/page/cellGridReport';

suite('Cell grid of the window', () => {
  test('tells the cell and the screen of the terminal in device pixels, the same in every tab, so the window is sized to whole cells whatever tool it shows', () => {
    assert.deepStrictEqual(
      cellReportWithin(
        { width: 1386.4, height: 760 },
        { width: 7.2, height: 17.6 },
        1.25,
      ),
      { cell: { width: 9, height: 22 }, screen: { width: 1733, height: 950 } },
    );
  });

  test('tells nothing while the page has laid out no cell yet, as no grid could be fitted to one', () => {
    assert.strictEqual(
      cellReportWithin(
        { width: 1386.4, height: 760 },
        { width: 0, height: 17.6 },
        1.25,
      ),
      undefined,
    );
  });
});
