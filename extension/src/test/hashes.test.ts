import * as assert from 'node:assert';
import { isHashPrefix } from '../shared/hashes';

suite('hash prefixes', () => {
  test('are 4 to 64 hex digits in either case', () => {
    for (const text of ['abcd', 'ABCD12', 'a'.repeat(40), 'a'.repeat(64)]) {
      assert.ok(isHashPrefix(text), text);
    }
    for (const text of ['', 'abc', 'abcg', 'xyz1', 'a'.repeat(65)]) {
      assert.ok(!isHashPrefix(text), text);
    }
  });
});
