import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  emptyTabView,
  reduceTabView,
  treeOf,
  treeToLoad,
  type TabView,
} from '../../../../../tools/git/page/tabView';

const openTab = (view: TabView, worktree: string) =>
  reduceTabView(view, {
    type: 'worktrees',
    worktree,
    worktrees: [],
  });

suite('Tree of a tab', () => {
  test("asks for a commit's tree once, and again after the tab reopens", () => {
    const view = reduceTabView(emptyTabView, { type: 'showCommit', hash: 'a' });
    assert.strictEqual(treeToLoad(view), 'a');
    const asked = reduceTabView(view, { type: 'requestTree', hash: 'a' });
    assert.strictEqual(treeToLoad(asked), undefined);
    const late = reduceTabView(asked, { type: 'tree', hash: 'b', paths: [] });
    assert.strictEqual(treeToLoad(late), undefined);
    const loaded = reduceTabView(asked, { type: 'tree', hash: 'a', paths: [] });
    assert.strictEqual(treeToLoad(loaded), undefined);
    const reopened = reduceTabView(openTab(asked, 'two'), {
      type: 'showCommit',
      hash: 'a',
    });
    assert.strictEqual(treeToLoad(reopened), 'a');
  });

  test("keeps the selected commit's tree when an earlier commit's tree arrives after it", () => {
    let view = reduceTabView(emptyTabView, { type: 'showCommit', hash: 'a' });
    view = reduceTabView(view, { type: 'requestTree', hash: 'a' });
    view = reduceTabView(view, { type: 'showCommit', hash: 'b' });
    view = reduceTabView(view, { type: 'requestTree', hash: 'b' });
    view = reduceTabView(view, { type: 'tree', hash: 'b', paths: ['b'] });
    view = reduceTabView(view, { type: 'tree', hash: 'a', paths: ['a'] });
    assert.deepStrictEqual(treeOf(view), ['b']);
    assert.strictEqual(treeToLoad(view), undefined);
  });

  test('asks again for the tree of a commit deselected before its tree arrived', () => {
    let view = reduceTabView(emptyTabView, { type: 'showCommit', hash: 'a' });
    view = reduceTabView(view, { type: 'requestTree', hash: 'a' });
    view = reduceTabView(view, { type: 'showCommit', hash: undefined });
    view = reduceTabView(view, { type: 'tree', hash: 'a', paths: ['a'] });
    view = reduceTabView(view, { type: 'showCommit', hash: 'a' });
    assert.strictEqual(treeToLoad(view), 'a');
  });

  test('asks again for the tree of a commit left for another without asking for its tree', () => {
    let view = reduceTabView(emptyTabView, { type: 'showCommit', hash: 'a' });
    view = reduceTabView(view, { type: 'requestTree', hash: 'a' });
    view = reduceTabView(view, { type: 'showCommit', hash: 'b' });
    view = reduceTabView(view, { type: 'tree', hash: 'a', paths: ['a'] });
    view = reduceTabView(view, { type: 'showCommit', hash: 'a' });
    assert.strictEqual(treeToLoad(view), 'a');
  });

  test('does not ask again for a tree on the way when its commit is shown again', () => {
    let view = reduceTabView(emptyTabView, { type: 'showCommit', hash: 'a' });
    view = reduceTabView(view, { type: 'requestTree', hash: 'a' });
    view = reduceTabView(view, { type: 'showCommit', hash: 'a' });
    assert.strictEqual(treeToLoad(view), undefined);
  });

  test('shows the tree of the selected commit only', () => {
    assert.strictEqual(treeOf(emptyTabView), undefined);
    const view = reduceTabView(emptyTabView, { type: 'showCommit', hash: 'a' });
    const other = reduceTabView(view, {
      type: 'tree',
      hash: 'b',
      paths: ['b'],
    });
    assert.strictEqual(treeOf(other), undefined);
    const loaded = reduceTabView(view, {
      type: 'tree',
      hash: 'a',
      paths: ['a'],
    });
    assert.deepStrictEqual(treeOf(loaded), ['a']);
  });
});
