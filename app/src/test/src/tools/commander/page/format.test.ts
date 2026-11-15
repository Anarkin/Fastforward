import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { formatSize } from '../../../../../tools/commander/page/format';

suite('Commander format', () => {
  test('writes sizes in bytes with thousands grouped, and none for a folder', () => {
    assert.strictEqual(formatSize(12_288), '12,288');
    assert.strictEqual(formatSize(1_007_528), '1,007,528');
    assert.strictEqual(formatSize(0), '0');
    assert.strictEqual(formatSize(undefined), '');
  });
});
