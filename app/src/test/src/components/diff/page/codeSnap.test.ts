import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { codeSnapOf } from '../../../../../components/diff/page/codeSnap';

suite('Code grid', () => {
  test('moves the start of code onto the nearest whole device pixel, keeping a side it cannot find where it was', () => {
    const last = { inline: 0.2, left: 0.1, right: -0.3 };
    const snap = codeSnapOf(
      { inline: 683.7, left: undefined, right: 1000.3 },
      1.25,
      last,
    );
    assert.ok(Math.abs((683.7 + snap.inline) * 1.25 - 855) < 1e-9);
    assert.strictEqual(snap.left, 0.1);
    assert.ok(Math.abs((1000.3 + snap.right) * 1.25 - 1250) < 1e-9);
  });
});
