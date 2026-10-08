import * as assert from 'node:assert';
import {
  compareWith,
  comparedOf,
  comparisonLabel,
  comparisonOf,
  shownSide,
  sidesOf,
  workingTreeSide,
} from '../../shared/comparisons';
import { workingTreeHash } from '../../shared/protocol';

suite('Comparisons', () => {
  test('names the commit selected first as the side compared from', () => {
    const selection = comparisonOf('a', 'b');
    assert.deepStrictEqual(comparedOf(selection), { from: 'a', to: 'b' });
    assert.deepStrictEqual(sidesOf(selection), ['a', 'b']);
  });

  test('takes a single commit or nothing for no comparison', () => {
    assert.strictEqual(comparedOf('a'), undefined);
    assert.strictEqual(comparedOf(workingTreeHash), undefined);
    assert.strictEqual(comparedOf(undefined), undefined);
    assert.deepStrictEqual(sidesOf('a'), ['a']);
  });

  test('shows a comparison at the commit compared to, and a single commit at itself', () => {
    assert.strictEqual(shownSide(comparisonOf('a', 'b')), 'b');
    assert.strictEqual(
      shownSide(comparisonOf('a', workingTreeHash)),
      workingTreeHash,
    );
    assert.strictEqual(shownSide('a'), 'a');
    assert.strictEqual(shownSide(undefined), undefined);
  });

  test('compares the selected commit with the one added, in the order picked', () => {
    assert.strictEqual(compareWith('a', 'b'), comparisonOf('a', 'b'));
    assert.strictEqual(compareWith('b', 'a'), comparisonOf('b', 'a'));
    assert.strictEqual(
      compareWith(workingTreeHash, 'a'),
      comparisonOf(workingTreeHash, 'a'),
    );
  });

  test('selects the commit added when nothing else is, and keeps a commit added to itself', () => {
    assert.strictEqual(compareWith(undefined, 'a'), 'a');
    assert.strictEqual(compareWith('a', 'a'), 'a');
  });

  test('replaces the side compared to when a third commit is added', () => {
    assert.strictEqual(
      compareWith(comparisonOf('a', 'b'), 'c'),
      comparisonOf('a', 'c'),
    );
  });

  test('keeps the other commit alone when either compared one is added again', () => {
    assert.strictEqual(compareWith(comparisonOf('a', 'b'), 'a'), 'b');
    assert.strictEqual(compareWith(comparisonOf('a', 'b'), 'b'), 'a');
  });

  test('labels the sides by their short hashes, and the working tree as uncommitted', () => {
    const from = '0123456789abcdef0123456789abcdef01234567';
    assert.strictEqual(
      comparisonLabel({ from, to: workingTreeHash }),
      '0123456 → uncommitted',
    );
    assert.strictEqual(
      comparisonLabel({ from: workingTreeHash, to: from }),
      'uncommitted → 0123456',
    );
  });

  test('finds the side of a diff the working tree is on, if any', () => {
    assert.strictEqual(workingTreeSide(workingTreeHash), 'new');
    assert.strictEqual(
      workingTreeSide(comparisonOf('a', workingTreeHash)),
      'new',
    );
    assert.strictEqual(
      workingTreeSide(comparisonOf(workingTreeHash, 'a')),
      'old',
    );
    assert.strictEqual(workingTreeSide(comparisonOf('a', 'b')), undefined);
    assert.strictEqual(workingTreeSide('a'), undefined);
  });
});
