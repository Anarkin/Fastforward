import * as assert from 'node:assert';
import type { HistoryEntry } from '../../git/history';
import { Commits } from '../../history/commits';
import {
  headsOf,
  mergesHiding,
  showHistory,
  type ShownEntry,
} from '../../history/merges';
import { rowsOf } from './historyFixtures';

const history = [
  { hash: 'm', parents: ['a', 'b2'] },
  { hash: 'b2', parents: ['b1'] },
  { hash: 'a', parents: ['c'] },
  { hash: 'b1', parents: ['c'] },
  { hash: 'c', parents: [] },
];

const pull = [
  { hash: 'p', parents: ['d2', 'm1'] },
  { hash: 'd2', parents: ['d1'] },
  { hash: 'm1', parents: ['base', 'f1'] },
  { hash: 'f1', parents: ['base'] },
  { hash: 'd1', parents: ['base'] },
  { hash: 'base', parents: [] },
];

function shownOf(
  entries: readonly HistoryEntry[],
  tips: ReadonlySet<string>,
  isExpanded: (hash: string, isPull: boolean) => boolean,
  partial?: boolean,
): ShownEntry[] {
  return rowsOf(showHistory(Commits.of(entries), tips, isExpanded, partial));
}

function pulled(entries: readonly HistoryEntry[]): string[] {
  const found: string[] = [];
  shownOf(entries, new Set([entries[0].hash]), (hash, isPull) => {
    if (isPull) {
      found.push(hash);
    }
    return true;
  });
  return found;
}

suite('Merges shown', () => {
  test('hides what a collapsed merge brought in', () => {
    const shown = shownOf(history, new Set(['m']), () => false);
    assert.deepStrictEqual(shown, [
      { hash: 'm', parents: ['a'], merge: 'collapsed', hidden: 2 },
      { hash: 'a', parents: ['c'] },
      { hash: 'c', parents: [] },
    ]);
  });

  test('leaves out the count of a merge whose merged commits go on past a history still loading, keeping the counts known', () => {
    const loading = [
      { hash: 'm2', parents: ['m1', 'x2'] },
      { hash: 'x2', parents: ['x1'] },
      { hash: 'm1', parents: ['a', 'b1'] },
      { hash: 'b1', parents: ['a'] },
      { hash: 'a', parents: ['z'] },
    ];
    const counts = (partial: boolean) =>
      shownOf(loading, new Set(['m2']), () => false, partial)
        .filter((entry) => entry.merge)
        .map((entry) => [entry.hash, entry.hidden]);
    assert.deepStrictEqual(counts(true), [
      ['m2', undefined],
      ['m1', 1],
    ]);
    assert.deepStrictEqual(counts(false), [
      ['m2', 2],
      ['m1', 1],
    ]);
  });

  test('counts a commit merged twice only for the merge that brought it in first', () => {
    const twice = [
      { hash: 'm2', parents: ['m1', 'd2'] },
      { hash: 'd2', parents: ['d1'] },
      { hash: 'm1', parents: ['base', 'd1'] },
      { hash: 'd1', parents: ['base'] },
      { hash: 'base', parents: [] },
    ];
    const shown = shownOf(twice, new Set(['m2']), () => false);
    assert.deepStrictEqual(
      shown.map((entry) => [entry.hash, entry.merge, entry.hidden]),
      [
        ['m2', 'collapsed', 1],
        ['m1', 'collapsed', 1],
        ['base', undefined, undefined],
      ],
    );
  });

  test('shows the merged branch of an expanded merge', () => {
    const shown = shownOf(history, new Set(['m']), (hash) => hash === 'm');
    assert.deepStrictEqual(
      shown.map((entry) => entry.hash),
      ['m', 'b2', 'a', 'b1', 'c'],
    );
    assert.strictEqual(shown[0].merge, 'expanded');
    assert.deepStrictEqual(shown[0].parents, ['a', 'b2']);
  });

  test('tells a merge that took a line of merges into a branch of commits, as git pull leaves on a mainline of merges', () => {
    assert.deepStrictEqual(pulled(pull), ['p']);
  });

  test('tells no merge of a branch of commits a pull', () => {
    assert.deepStrictEqual(pulled(history), []);
  });

  test('tells no merge a pull when its first parent took in merges too', () => {
    const integration = [
      { hash: 'm', parents: ['m1', 'i1'] },
      { hash: 'm1', parents: ['base', 'f'] },
      { hash: 'i1', parents: ['base', 'g'] },
      { hash: 'f', parents: ['base'] },
      { hash: 'g', parents: ['base'] },
      { hash: 'base', parents: [] },
    ];
    assert.deepStrictEqual(pulled(integration), []);
  });

  test('tells no merge a pull when its second parent reaches the first through a commit', () => {
    const direct = [
      { hash: 'p', parents: ['d1', 'm1'] },
      { hash: 'm1', parents: ['x', 'f'] },
      { hash: 'x', parents: ['base'] },
      { hash: 'f', parents: ['base'] },
      { hash: 'd1', parents: ['base'] },
      { hash: 'base', parents: [] },
    ];
    assert.deepStrictEqual(pulled(direct), []);
  });

  test('tells no merge a pull when its first parent has no commits of its own', () => {
    const stacked = [
      { hash: 'n', parents: ['base', 'm1'] },
      { hash: 'm1', parents: ['base', 'f'] },
      { hash: 'f', parents: ['base'] },
      { hash: 'base', parents: [] },
    ];
    assert.deepStrictEqual(pulled(stacked), []);
  });

  test('shows every tip it is given', () => {
    const shown = shownOf(history, new Set(['m', 'b1']), () => false);
    assert.deepStrictEqual(
      shown.map((entry) => entry.hash),
      ['m', 'a', 'b1', 'c'],
    );
  });

  test('keeps the parents missing from the history, counting them hidden behind a merge', () => {
    const partial = [
      { hash: 'm', parents: ['a', 'x'] },
      { hash: 'a', parents: ['y'] },
    ];
    assert.deepStrictEqual(
      shownOf(partial, new Set(['m']), () => false),
      [
        { hash: 'm', parents: ['a'], merge: 'collapsed', hidden: 1 },
        { hash: 'a', parents: ['y'] },
      ],
    );
    assert.deepStrictEqual(
      shownOf(partial, new Set(['m']), () => true)[0].parents,
      ['a', 'x'],
    );
  });
});

suite('Positions shown', () => {
  test('places each shown commit, and none hidden or outside the history', () => {
    const { positions } = showHistory(
      Commits.of(history),
      new Set(['m']),
      () => false,
    );
    assert.deepStrictEqual(
      ['m', 'a', 'c', 'b1', 'z'].map((hash) => positions.get(hash)),
      [0, 1, 2, undefined, undefined],
    );
    assert.ok(positions.has('c'));
    assert.ok(!positions.has('b2'));
  });
});

suite('Branch heads', () => {
  test('finds unmerged tips, not the tips of merged branches', () => {
    const heads = headsOf(
      Commits.of([{ hash: 'u', parents: ['c'] }, ...history]),
    );
    assert.deepStrictEqual([...heads].toSorted(), ['m', 'u']);
  });
});

suite('Merges hiding a commit', () => {
  test('finds the merge that brought a hidden commit in', () => {
    const shown = new Set(['m', 'a', 'c']);
    assert.deepStrictEqual(mergesHiding(Commits.of(history), shown, 'b1'), [
      'm',
    ]);
  });

  test('finds nothing for a shown commit', () => {
    const shown = new Set(['m', 'a', 'c']);
    assert.deepStrictEqual(mergesHiding(Commits.of(history), shown, 'a'), []);
  });

  test('finds nested merges on the way', () => {
    const nested = [
      { hash: 'n', parents: ['x', 'm'] },
      { hash: 'x', parents: ['c'] },
      ...history,
    ];
    const shown = new Set(['n', 'x', 'c']);
    assert.deepStrictEqual(
      mergesHiding(Commits.of(nested), shown, 'b1').toSorted(),
      ['m', 'n'],
    );
  });
});
