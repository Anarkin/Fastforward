import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { foundCommits } from '../../../../../tools/git/page/commitQuery';
import { commitInfo } from '../../../../helpers/gitValues';

suite('Commit query', () => {
  test('puts the commits a typed hash may be before those found by text, each once', () => {
    const found = foundCommits(
      [commitInfo('a1')],
      [commitInfo('a1'), commitInfo('b2')],
    );
    assert.deepStrictEqual(
      found.map((commit) => commit.hash),
      ['a1', 'b2'],
    );
  });
});
