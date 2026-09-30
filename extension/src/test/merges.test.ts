import * as assert from 'node:assert';
import { headsOf, mergesHiding, showHistory } from '../history/merges';

const history = [
  { hash: 'm', parents: ['a', 'b2'] },
  { hash: 'b2', parents: ['b1'] },
  { hash: 'a', parents: ['c'] },
  { hash: 'b1', parents: ['c'] },
  { hash: 'c', parents: [] },
];

suite('showHistory', () => {
  test('hides what a collapsed merge brought in', () => {
    const shown = showHistory(history, new Set(['m']), () => false);
    assert.deepStrictEqual(shown, [
      { hash: 'm', parents: ['a'], merge: 'collapsed', hidden: 2 },
      { hash: 'a', parents: ['c'] },
      { hash: 'c', parents: [] },
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
    const shown = showHistory(twice, new Set(['m2']), () => false);
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
    const shown = showHistory(history, new Set(['m']), (hash) => hash === 'm');
    assert.deepStrictEqual(
      shown.map((entry) => entry.hash),
      ['m', 'b2', 'a', 'b1', 'c'],
    );
    assert.strictEqual(shown[0].merge, 'expanded');
    assert.deepStrictEqual(shown[0].parents, ['a', 'b2']);
  });

  test('shows every tip it is given', () => {
    const shown = showHistory(history, new Set(['m', 'b1']), () => false);
    assert.deepStrictEqual(
      shown.map((entry) => entry.hash),
      ['m', 'a', 'b1', 'c'],
    );
  });
});

suite('headsOf', () => {
  test('finds unmerged tips, not the tips of merged branches', () => {
    const heads = headsOf([{ hash: 'u', parents: ['c'] }, ...history]);
    assert.deepStrictEqual([...heads].toSorted(), ['m', 'u']);
  });
});

suite('mergesHiding', () => {
  test('finds the merge that brought a hidden commit in', () => {
    const shown = new Set(['m', 'a', 'c']);
    assert.deepStrictEqual(mergesHiding(history, shown, 'b1'), ['m']);
  });

  test('finds nothing for a shown commit', () => {
    const shown = new Set(['m', 'a', 'c']);
    assert.deepStrictEqual(mergesHiding(history, shown, 'a'), []);
  });

  test('finds nested merges on the way', () => {
    const nested = [
      { hash: 'n', parents: ['x', 'm'] },
      { hash: 'x', parents: ['c'] },
      ...history,
    ];
    const shown = new Set(['n', 'x', 'c']);
    assert.deepStrictEqual(mergesHiding(nested, shown, 'b1').toSorted(), [
      'm',
      'n',
    ]);
  });
});
