import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { plainSearch } from '../../../../../lib/shared/searchOptions';
import { createGitStore } from '../../../../../tools/git/page/store';
import { currentOf, unplaced } from '../../../../../components/diff/page/place';
import { drawnPlaceFor } from '../../../../../components/diff/page/slice';
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

  test('gives the place a diff is drawn by, its folded files, how far across it is and the match it is on, as the very one given before while the diff only scrolled, so a scroll draws the diff once and not again for where it was kept, and the place scrolled to whenever it is asked for', () => {
    const store = createGitStore(noop);
    const { keepDiffPlace, diffPlaceOf } = store.getState();
    const drawn = drawnPlaceFor('/repo', 'x');
    const now = () => drawn(store.getState());
    assert.strictEqual(now(), undefined);

    keepDiffPlace('/repo', 'x', { top: 40 });
    const first = now();
    keepDiffPlace('/repo', 'x', {
      top: 900,
      left: 12,
      anchor: { shows: ['a'], fraction: 0.5 },
    });
    assert.strictEqual(now(), first);
    assert.strictEqual(diffPlaceOf('/repo', 'x')?.top, 900);

    const changes = [
      { toggled: new Map([['a.txt', true]]) },
      { sideways: 80 },
      { current: 3 },
    ];
    let before = first;
    for (const change of changes) {
      keepDiffPlace('/repo', 'x', change);
      const after = now();
      assert.notStrictEqual(after, before, Object.keys(change).join());
      assert.strictEqual(after?.top, 900);
      before = after;
    }
    keepDiffPlace('/repo', 'y', { top: 5 });
    assert.strictEqual(now(), before);
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
