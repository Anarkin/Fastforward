import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { plainFilter } from '../../../../helpers/filters';
import { indexRefs } from '../../../../../tools/git/page/refIndex';
import { branchNamed } from './locationsFixtures';
import {
  currentActive,
  nextActive,
  type Highlighted,
} from '../../../../../tools/git/page/locationHighlight';
import {
  resultItems,
  searchRefs,
} from '../../../../../tools/git/page/locationResults';
import { commitInfo } from '../../../../helpers/gitValues';

const resultsFor = (commits: string[], branches: string[]) =>
  resultItems(
    commits.map((hash) => commitInfo(hash)),
    searchRefs(indexRefs(branches.map(branchNamed)), plainFilter('a')),
  );

suite('Locations search', () => {
  test('moves the highlight one result at a time, stopping at either end', () => {
    const items = resultItems(
      [commitInfo('f1')],
      searchRefs(indexRefs([branchNamed('main')]), plainFilter('main')),
    );
    assert.strictEqual(nextActive(items, 0, 1), 1);
    assert.strictEqual(nextActive(items, 1, 1), 1);
    assert.strictEqual(nextActive(items, 1, -1), 0);
    assert.strictEqual(nextActive(items, 0, -1), 0);
  });

  test('keeps the highlight on its result while the results change, and otherwise starts at the first', () => {
    const highlight: Highlighted = { query: 'a', key: 'branch:feat/x' };
    assert.strictEqual(
      currentActive(resultsFor([], ['alpha', 'feat/x']), 'a', highlight),
      1,
    );
    assert.strictEqual(
      currentActive(
        resultsFor(['a1'], ['alpha', 'ab', 'feat/x']),
        'a',
        highlight,
      ),
      2,
    );
    assert.strictEqual(
      currentActive(resultsFor(['a1'], ['main']), 'a', highlight),
      0,
    );
    assert.strictEqual(
      currentActive(resultsFor([], ['alpha', 'feat/x']), 'al', highlight),
      0,
    );
  });
});
