import * as assert from 'node:assert';
import {
  defaultColumnWidths,
  maxWidth,
  templateOf,
  widthsToLoad,
} from '../webview/columns';

suite('Columns', () => {
  test('gives a hidden column no width, keeping the others', () => {
    assert.strictEqual(
      templateOf([460, 300], [true, false]),
      '0px 300px minmax(240px, 1fr)',
    );
    assert.strictEqual(
      templateOf([460, 300], [false, false]),
      '460px 300px minmax(240px, 1fr)',
    );
  });

  test('leaves the last column its room, which a hidden column does not take', () => {
    // 1000 less the other column's 300 and the last column's 240
    assert.strictEqual(maxWidth([460, 300], [false, false], 0, 1000), 460);
    assert.strictEqual(maxWidth([460, 300], [true, false], 1, 1000), 760);
    // Never narrower than a column can be
    assert.strictEqual(maxWidth([460, 300], [false, false], 1, 500), 120);
  });

  test('loads saved widths, or the defaults for ones of other columns', () => {
    assert.deepStrictEqual(widthsToLoad([400, 250]), [400, 250]);
    assert.strictEqual(widthsToLoad(undefined), defaultColumnWidths);
    assert.strictEqual(widthsToLoad([400]), defaultColumnWidths);
  });
});
