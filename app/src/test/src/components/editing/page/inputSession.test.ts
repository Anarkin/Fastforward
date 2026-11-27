import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { differing } from '../../../../../components/editing/page/inputSession';

suite('The text typed into the editor', () => {
  test('finds what changed between the text the input held and the one it holds now: what was typed, what was deleted and what was put in place of another text, and nothing where they are alike', () => {
    assert.deepStrictEqual(differing('abc', 'abXc', 3, false), {
      from: 2,
      toA: 2,
      toB: 3,
    });
    assert.deepStrictEqual(differing('abc', 'ac', 1, true), {
      from: 1,
      toA: 2,
      toB: 1,
    });
    assert.deepStrictEqual(differing('one two', 'one 2', 7, false), {
      from: 4,
      toA: 7,
      toB: 5,
    });
    assert.strictEqual(differing('same', 'same', 2, false), undefined);
  });

  test('takes a character typed or deleted in a run of the same one for the one at the cursor, as the first of the run was changed whichever the cursor stood at', () => {
    assert.deepStrictEqual(differing('aaa', 'aaaa', 1, false), {
      from: 1,
      toA: 1,
      toB: 2,
    });
    assert.deepStrictEqual(differing('aaa', 'aaaa', 3, false), {
      from: 3,
      toA: 3,
      toB: 4,
    });
    assert.deepStrictEqual(differing('aaaa', 'aaa', 2, true), {
      from: 1,
      toA: 2,
      toB: 1,
    });
  });
});
