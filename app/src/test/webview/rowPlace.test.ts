import * as assert from 'node:assert';
import { rowPlace } from '../../webview/rowPlace';

suite('Row place', () => {
  test('places a row by its top rather than a transform, as only layout snaps to device pixels, so tinted rows meet without a seam at a display scale like 125%', () => {
    assert.deepStrictEqual(rowPlace(55, 22), { height: 22, top: 55 });
    assert.deepStrictEqual(rowPlace(0, undefined), {
      height: undefined,
      top: 0,
    });
  });
});
