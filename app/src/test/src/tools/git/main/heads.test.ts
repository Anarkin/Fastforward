import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { Commits } from '../../../../../tools/git/main/commits';
import { headsOf } from '../../../../../tools/git/main/heads';

const history = [
  { hash: 'm', parents: ['a', 'b2'] },
  { hash: 'b2', parents: ['b1'] },
  { hash: 'a', parents: ['c'] },
  { hash: 'b1', parents: ['c'] },
  { hash: 'c', parents: [] },
];

suite('Branch heads', () => {
  test('finds unmerged tips, not the tips of merged branches', () => {
    const heads = headsOf(
      Commits.of([{ hash: 'u', parents: ['c'] }, ...history]),
    );
    assert.deepStrictEqual([...heads].toSorted(), ['m', 'u']);
  });
});
