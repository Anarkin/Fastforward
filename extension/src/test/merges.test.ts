import * as assert from 'node:assert';
import { headsOf, mergesHiding, showHistory } from '../git/merges';

// m merges b2 into a; b1 and b2 are only reachable through the merge
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
      // b2 and b1 are hidden in it
      { hash: 'm', parents: ['a'], merge: 'collapsed', hidden: 2 },
      { hash: 'a', parents: ['c'] },
      { hash: 'c', parents: [] },
    ]);
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
    // u is an unmerged branch off c; b2 was merged by m, so it has a child
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
    // n merges m's branch in; m in turn merged b2
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
