import * as assert from 'node:assert';
import { isFullHash, isHashPrefix } from '../../shared/hashes';

suite('Hashes', () => {
  test('take 4 to 64 hex digits in either case as a prefix', () => {
    for (const text of ['abcd', 'ABCD12', 'a'.repeat(40), 'a'.repeat(64)]) {
      assert.ok(isHashPrefix(text), text);
    }
    for (const text of ['', 'abc', 'abcg', 'xyz1', 'a'.repeat(65)]) {
      assert.ok(!isHashPrefix(text), text);
    }
  });

  test('tell a full SHA-1 or SHA-256 hash, in either case, from a prefix', () => {
    for (const text of ['a'.repeat(40), 'A'.repeat(40), 'b'.repeat(64)]) {
      assert.ok(isFullHash(text), text);
    }
    for (const text of ['a'.repeat(39), 'g'.repeat(40), 'a'.repeat(41)]) {
      assert.ok(!isFullHash(text), text);
    }
  });
});
