import * as assert from 'node:assert';
import { scrollTarget } from '../webview/virtualRows';

suite('Virtual rows', () => {
  test('scrolls to the selected row again once the rows arrive, as a tree loads after its file was selected', () => {
    assert.strictEqual(scrollTarget('a', 0), undefined);
    assert.strictEqual(scrollTarget('a', 2), 'a');
    assert.strictEqual(scrollTarget(undefined, 2), undefined);
  });
});
