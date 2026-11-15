import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { comparisonOf } from '../../../../../tools/git/shared/comparisons';
import { workingTreeHash } from '../../../../../tools/git/shared/protocol';
import {
  newTabState,
  parentOf,
  select,
  stillThere,
} from '../../../../../tools/git/main/tabState';
import { loadHistory } from '../../../../../tools/git/main/tabHistory';
import { layOutHistory } from '../../../../../tools/git/main/tabLayout';
import { Commits } from '../../../../../tools/git/main/commits';
import { history, laidOut } from './tabStateFixtures';

suite('Tab state', () => {
  test('selects a commit at its position, dropping the selected file', () => {
    const tab = laidOut(history);
    tab.path = 'x';
    select(tab, 'b');
    assert.deepStrictEqual(
      [tab.hash, tab.index, tab.path],
      ['b', 1, undefined],
    );
    select(tab, workingTreeHash);
    assert.strictEqual(tab.index, -1);
    select(tab, undefined);
    assert.deepStrictEqual([tab.hash, tab.index], [undefined, undefined]);
  });

  test('finds the first parent of the selected commit, past the commits its merge brought in', () => {
    const tab = newTabState();
    loadHistory(tab, Commits.of(history), { name: 'main', commit: 'c' }, []);
    layOutHistory(tab, false, 'c');
    const parent = (selection: string) => {
      select(tab, selection);
      return parentOf(tab);
    };
    assert.strictEqual(parent('c'), 'a');
    assert.strictEqual(parent('b'), 'a');
    assert.strictEqual(parent(workingTreeHash), 'c');
    assert.strictEqual(parent('a'), undefined);
    assert.strictEqual(parent(comparisonOf('c', 'b')), undefined);
    layOutHistory(tab, true, 'c');
    assert.strictEqual(parent('c'), 'a');
    assert.strictEqual(parent('b'), undefined);
  });

  test('finds no parent of the working tree without a checked-out commit', () => {
    const tab = laidOut(history);
    select(tab, workingTreeHash);
    assert.strictEqual(parentOf(tab), undefined);
  });

  test('selects a comparison at the position of the commit compared to', () => {
    const tab = laidOut(history);
    select(tab, comparisonOf('c', 'b'));
    assert.strictEqual(tab.index, 1);
    select(tab, comparisonOf('b', workingTreeHash));
    assert.strictEqual(tab.index, -1);
  });

  test('keeps a comparison while both of its commits are in the history', () => {
    const exists = stillThere(laidOut(history));
    assert.ok(exists(comparisonOf('a', 'c')));
    assert.ok(exists(comparisonOf(workingTreeHash, 'c')));
    assert.ok(!exists(comparisonOf('a', 'x')));
    assert.ok(!exists(comparisonOf('x', workingTreeHash)));
  });
});
