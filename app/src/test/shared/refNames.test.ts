import * as assert from 'node:assert';
import type { RefInfo } from '../../shared/protocol';
import { findRef, refOf } from '../../shared/refNames';

suite('Ref names', () => {
  const refs: RefInfo[] = [
    { kind: 'remote', name: 'main', commit: 'a' },
    { kind: 'branch', name: 'main', commit: 'b' },
  ];

  test('finds the ref of the same kind and name, with its commit', () => {
    assert.deepStrictEqual(findRef(refs, { kind: 'branch', name: 'main' }), {
      kind: 'branch',
      name: 'main',
      commit: 'b',
    });
  });

  test('finds nothing when only the name matches', () => {
    assert.strictEqual(findRef(refs, { kind: 'tag', name: 'main' }), undefined);
  });

  test('names a ref by its kind and name, leaving its commit out', () => {
    const tag: RefInfo = { kind: 'tag', name: 'v1', commit: 'a' };
    assert.deepStrictEqual(refOf(tag), { kind: 'tag', name: 'v1' });
  });
});
