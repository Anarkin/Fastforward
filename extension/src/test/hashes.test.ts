import * as assert from 'node:assert';
import { isFullHash } from '../shared/hashes';

suite('Hashes', () => {
  test('tells a full hash, in either case, from a prefix', () => {
    assert.ok(isFullHash('a'.repeat(40)));
    assert.ok(isFullHash('A'.repeat(40)));
    assert.ok(!isFullHash('a'.repeat(39)));
    assert.ok(!isFullHash('g'.repeat(40)));
  });
});
