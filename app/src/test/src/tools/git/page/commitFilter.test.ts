import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { RefInfo } from '../../../../../tools/git/shared/protocol';
import {
  filteredHistory,
  foundCount,
  steppedCommit,
} from '../../../../../tools/git/page/commitFilter';
import { commitInfo } from '../../../../helpers/gitValues';

const found = [commitInfo('a'), commitInfo('b'), commitInfo('c')];

const branch = (name: string): RefInfo => ({
  kind: 'branch',
  name,
  commit: '',
});

suite('Commit filter', () => {
  test('lists the commits found in the order git found them, with no graph, the bubbles of each counted as the list counts them', () => {
    const history = filteredHistory(found, {
      refsByCommit: new Map([
        ['b', [branch('main')]],
        ['c', [branch('one'), branch('two')]],
      ]),
      stashCommits: new Set(),
      bookmarked: new Set(),
      detached: undefined,
    });
    assert.strictEqual(history.total, 3);
    assert.deepStrictEqual(
      [0, 1, 2].map((position) => history.at(position)?.hash),
      ['a', 'b', 'c'],
    );
    assert.strictEqual(history.graphAt(0), undefined);
    assert.deepStrictEqual(
      [0, 1, 2].map((position) => history.hasBubbles(position)),
      [false, true, true],
    );
    assert.deepStrictEqual(
      [0, 1, 2].map((position) => history.isCrowded(position)),
      [false, false, true],
    );
    assert.strictEqual(history.positionOf('c'), 2);
  });

  test('counts the commit selected among those found, says while it searches, and steps from one found to the next around and around', () => {
    assert.deepStrictEqual(foundCount(found, 'b', false), {
      current: 1,
      matches: 3,
      capped: false,
    });
    assert.deepStrictEqual(foundCount(undefined, 'b', false), {
      current: -1,
      matches: 0,
      searching: true,
    });
    assert.strictEqual(foundCount(found, 'z', true).current, -1);
    assert.strictEqual(steppedCommit(found, 'b', 1), 'c');
    assert.strictEqual(steppedCommit(found, 'c', 1), 'a');
    assert.strictEqual(steppedCommit(found, 'a', -1), 'c');
    assert.strictEqual(steppedCommit(found, 'z', 1), 'a');
    assert.strictEqual(steppedCommit(found, 'z', -1), 'c');
    assert.strictEqual(steppedCommit([], 'z', 1), undefined);
  });
});
