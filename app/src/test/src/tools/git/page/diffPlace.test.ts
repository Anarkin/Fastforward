import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { plainSearch } from '../../../../../lib/shared/searchOptions';
import { createGitStore } from '../../../../../tools/git/page/store';
import { currentOf, unplaced } from '../../../../../tools/git/page/diffPlace';
import { noop } from '../../../../helpers/fixtures';

const foo = { query: 'foo', options: plainSearch };
const bar = { query: 'bar', options: plainSearch };

suite('Where the diff of a selection was left', () => {
  test('keeps the match the diff was on with the search that found it, as the search is kept per tab while the match is kept per selection', () => {
    const store = createGitStore(noop);
    const { keepDiffFind, keepDiffPlace, diffPlaceOf } = store.getState();
    keepDiffFind('/repo', { finding: true, search: foo });
    keepDiffPlace('/repo', 'x', { current: 5 });
    keepDiffFind('/repo', { finding: true, search: bar });
    keepDiffPlace('/repo', 'y', { current: 2 });
    keepDiffPlace('/repo', 'x', { top: 40 });
    assert.deepStrictEqual(
      [
        diffPlaceOf('/repo', 'x')?.currentFor,
        diffPlaceOf('/repo', 'y')?.currentFor,
      ],
      [foo, bar],
    );
  });

  test('finds from the first match once the search is not the one the match was found by', () => {
    const place = { ...unplaced, current: 5, currentFor: foo };
    assert.deepStrictEqual(
      [
        currentOf(place, foo),
        currentOf(place, bar),
        currentOf(place, { ...foo, options: { ...plainSearch, regex: true } }),
        currentOf({ ...unplaced, current: 3 }, foo),
        currentOf(undefined, foo),
      ],
      [5, 0, 0, 0, 0],
    );
  });
});
