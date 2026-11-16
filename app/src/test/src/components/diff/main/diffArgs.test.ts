import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { pathspecs } from '../../../../../components/diff/main/diffArgs';

suite('Pathspecs', () => {
  test('narrows to a path, or to the files given', () => {
    assert.deepStrictEqual(pathspecs({}), []);
    assert.deepStrictEqual(pathspecs({ path: 'a' }), ['a']);
    assert.deepStrictEqual(pathspecs({ path: 'b', oldPath: 'a' }), ['a', 'b']);
    assert.deepStrictEqual(pathspecs({ path: 'a*b', include: ['x'] }), ['a*b']);
    assert.deepStrictEqual(pathspecs({ include: ['[ab].md'] }), ['[ab].md']);
  });
});
