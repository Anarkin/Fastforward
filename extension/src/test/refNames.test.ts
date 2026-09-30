import * as assert from 'node:assert';
import type { RefInfo } from '../shared/protocol';
import { refOf } from '../shared/refNames';

suite('Ref names', () => {
  test('names a ref by its kind and name, leaving its commit out', () => {
    const tag: RefInfo = { kind: 'tag', name: 'v1', commit: 'a' };
    assert.deepStrictEqual(refOf(tag), { kind: 'tag', name: 'v1' });
  });
});
