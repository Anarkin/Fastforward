import * as assert from 'node:assert';
import {
  emptyTabView,
  reduceTabView,
  treeOf,
  treeToLoad,
  type TabView,
} from '../webview/tabView';
import { comparisonOf } from '../shared/comparisons';
import { commitPageSize } from '../shared/protocol';
import { commitInfo, fileChange } from './fixtures';

const openTab = (view: TabView, active: string) =>
  reduceTabView(view, { type: 'tabs', tabs: [], active, recent: [] });

const entire = (view: TabView) =>
  reduceTabView(view, { type: 'showEntireFile', entire: true });

function busyTab(): TabView {
  let view = reduceTabView(openTab(emptyTabView, 'one'), {
    type: 'commits',
    generation: 1,
    total: 2,
    decorations: [],
    start: 0,
    commits: [commitInfo('a')],
    graph: [],
    workingTreeGraph: { lane: 0, color: 0, lines: [] },
    selectedIndex: 0,
    scrollTarget: { index: 0 },
  });
  view = reduceTabView(view, {
    type: 'files',
    hash: 'a',
    files: [fileChange('x.ts')],
  });
  view = reduceTabView(view, {
    type: 'diff',
    hash: 'a',
    path: 'x.ts',
    patch: 'patch',
  });
  view = reduceTabView(view, { type: 'fetching', running: true });
  view = reduceTabView(view, { type: 'applyingSolo', running: true });
  return reduceTabView(view, { type: 'error', message: 'failed' });
}

suite('Tab view', () => {
  test('lets go of the selected commit, its files and diff when the app does', () => {
    const view = reduceTabView(busyTab(), { type: 'unselect' });
    assert.strictEqual(view.hash, undefined);
    assert.strictEqual(view.path, undefined);
    assert.deepStrictEqual(view.files, []);
    assert.strictEqual(view.patch, '');
    assert.strictEqual(view.history?.at(0)?.hash, 'a');
  });

  test('shows a file entire until another file, commit or tab is shown', () => {
    const shown = reduceTabView(busyTab(), { type: 'showFile', path: 'x.ts' });
    assert.strictEqual(shown.entireFile, false);
    assert.strictEqual(entire(shown).entireFile, true);
    assert.strictEqual(
      reduceTabView(entire(shown), { type: 'showEntireFile', entire: false })
        .entireFile,
      false,
    );
    assert.strictEqual(
      reduceTabView(entire(shown), { type: 'showFile', path: 'x.ts' })
        .entireFile,
      true,
    );
    assert.strictEqual(
      reduceTabView(entire(shown), { type: 'showFile', path: 'y.ts' })
        .entireFile,
      false,
    );
    assert.strictEqual(
      reduceTabView(entire(shown), { type: 'showCommit', hash: 'a' })
        .entireFile,
      false,
    );
    assert.strictEqual(
      openTab(openTab(entire(shown), 'two'), 'one').entireFile,
      false,
    );
  });

  test('keeps the view when the tabs change but not the active one, and starts over when another becomes active', () => {
    const view = busyTab();
    assert.strictEqual(openTab(view, 'one'), view);
    assert.deepStrictEqual(openTab(view, 'two'), {
      ...emptyTabView,
      root: 'two',
    });
  });

  test('scrolls a new history to where the extension says', () => {
    const view = busyTab();
    assert.deepStrictEqual(view.scrollTarget, { index: 0 });
    assert.strictEqual(view.history?.at(0)?.hash, 'a');
  });

  test('keeps the selected commit, its files and diff when a reloaded history comes', () => {
    const view = busyTab();
    const reloaded = reduceTabView(view, {
      type: 'commits',
      generation: 2,
      total: 3,
      decorations: [],
      start: 0,
      commits: [commitInfo('new'), commitInfo('a')],
      graph: [],
      workingTreeGraph: { lane: 0, color: 0, lines: [] },
      selectedIndex: 1,
      scrollTarget: { index: 1, offset: 7 },
    });
    assert.strictEqual(reloaded.hash, view.hash);
    assert.strictEqual(reloaded.files, view.files);
    assert.strictEqual(reloaded.path, view.path);
    assert.strictEqual(reloaded.patch, view.patch);
    assert.strictEqual(reloaded.history?.selectedIndex, 1);
  });

  test('loads a selected commit, apart from having no files', () => {
    const loading = reduceTabView(busyTab(), { type: 'showCommit', hash: 'b' });
    assert.ok(loading.filesLoading && loading.patchLoading);
    const empty = reduceTabView(loading, {
      type: 'files',
      hash: 'b',
      files: [],
    });
    assert.ok(!empty.filesLoading && empty.patchLoading);
    const done = reduceTabView(empty, {
      type: 'diff',
      hash: 'b',
      path: undefined,
      patch: '',
    });
    assert.ok(!done.patchLoading);
    const none = reduceTabView(done, { type: 'showCommit', hash: undefined });
    assert.ok(!none.filesLoading && !none.patchLoading);
  });

  test('clears the previous commit and error when selecting another', () => {
    const view = reduceTabView(busyTab(), { type: 'showCommit', hash: 'b' });
    assert.strictEqual(view.hash, 'b');
    assert.deepStrictEqual(view.files, []);
    assert.strictEqual(view.path, undefined);
    assert.strictEqual(view.patch, '');
    assert.strictEqual(view.error, undefined);
    assert.strictEqual(view.fetching, true);
  });

  test('clears the error when selecting another file', () => {
    const view = reduceTabView(busyTab(), { type: 'showFile', path: 'y.ts' });
    assert.strictEqual(view.error, undefined);
  });

  test('fills in pages of the history, re-rendering for the selected commit', () => {
    const before = busyTab();
    const after = reduceTabView(before, {
      type: 'commitPage',
      generation: 1,
      start: 1,
      commits: [commitInfo('b')],
      graph: [],
    });
    assert.strictEqual(after.history?.at(1)?.hash, 'b');
    assert.strictEqual(after.history?.getVersion(), 2);
    assert.strictEqual(after, before);
    const shown = reduceTabView(after, { type: 'showCommit', hash: 'c' });
    const selected = reduceTabView(shown, {
      type: 'commitPage',
      generation: 1,
      start: 2,
      commits: [commitInfo('c')],
      graph: [],
    });
    assert.notStrictEqual(selected, shown);
  });

  test('scrolls again to a commit revealed twice at the same position', () => {
    const first = reduceTabView(busyTab(), {
      type: 'reveal',
      hash: 'a',
      index: 0,
    });
    const second = reduceTabView(first, {
      type: 'reveal',
      hash: 'a',
      index: 0,
    });
    assert.deepStrictEqual(first.scrollTarget, { index: 0 });
    assert.deepStrictEqual(second.scrollTarget, { index: 0 });
    assert.notStrictEqual(second.scrollTarget, first.scrollTarget);
  });

  test('selects a revealed commit and knows where it is before its page loads', () => {
    const view = reduceTabView(busyTab(), {
      type: 'reveal',
      hash: 'z',
      index: 1,
    });
    assert.strictEqual(view.hash, 'z');
    assert.ok(view.filesLoading && view.patchLoading);
    assert.strictEqual(view.history?.positionOf('z'), 1);
    assert.strictEqual(view.history?.at(1), undefined);
  });

  test('selects a revealed comparison and knows where the commit compared to is', () => {
    const selection = comparisonOf('a', 'z');
    const view = reduceTabView(busyTab(), {
      type: 'reveal',
      hash: selection,
      index: 1,
    });
    assert.strictEqual(view.hash, selection);
    assert.strictEqual(view.history?.positionOf('z'), 1);
    assert.strictEqual(view.history?.positionOf(selection), undefined);
  });

  test('scrolls to the offset in a row where the extension says the history was scrolled', () => {
    const view = reduceTabView(emptyTabView, {
      type: 'commits',
      generation: 1,
      total: 10,
      decorations: [],
      start: 0,
      commits: [commitInfo('a')],
      graph: [],
      workingTreeGraph: { lane: 0, color: 0, lines: [] },
      selectedIndex: 0,
      scrollTarget: { index: 5, offset: 3 },
    });
    assert.deepStrictEqual(view.scrollTarget, { index: 5, offset: 3 });
  });

  test('scrolls nowhere for a new history the extension gives no place in', () => {
    const view = reduceTabView(busyTab(), {
      type: 'commits',
      generation: 2,
      total: 10,
      decorations: [],
      start: 0,
      commits: [commitInfo('a')],
      graph: [],
      workingTreeGraph: { lane: 0, color: 0, lines: [] },
      selectedIndex: undefined,
      scrollTarget: undefined,
    });
    assert.strictEqual(view.scrollTarget, undefined);
  });

  test('asks again for a page that came back empty', () => {
    const before = reduceTabView(emptyTabView, {
      type: 'commits',
      generation: 1,
      total: 3 * commitPageSize,
      decorations: [],
      start: 0,
      commits: [commitInfo('a')],
      graph: [],
      workingTreeGraph: { lane: 0, color: 0, lines: [] },
      selectedIndex: 0,
      scrollTarget: undefined,
    });
    const page = () =>
      before.history?.takeMissingPages(commitPageSize, 2 * commitPageSize - 1);
    assert.deepStrictEqual(page(), [commitPageSize]);
    const after = reduceTabView(before, {
      type: 'commitPage',
      generation: 1,
      start: commitPageSize,
      commits: [],
      graph: [],
    });
    assert.strictEqual(after, before);
    assert.deepStrictEqual(page(), [commitPageSize]);
  });

  test('stops loading the selected commit when an error comes', () => {
    const loading = reduceTabView(busyTab(), { type: 'showCommit', hash: 'b' });
    const failed = reduceTabView(loading, { type: 'error', message: 'failed' });
    assert.ok(!failed.filesLoading && !failed.patchLoading);
    assert.strictEqual(failed.error, 'failed');
  });

  test('re-renders only when the count of working tree changes changes', () => {
    const view = reduceTabView(emptyTabView, { type: 'workingTree', files: 2 });
    assert.strictEqual(
      reduceTabView(view, { type: 'workingTree', files: 2 }),
      view,
    );
    assert.strictEqual(
      reduceTabView(view, { type: 'workingTree', files: 3 }).workingTree,
      3,
    );
  });

  test('drops a page of the history before', () => {
    const before = busyTab();
    const after = reduceTabView(before, {
      type: 'commitPage',
      generation: 0,
      start: 1,
      commits: [commitInfo('b')],
      graph: [],
    });
    assert.strictEqual(after, before);
    assert.strictEqual(after.history?.at(1), undefined);
  });

  test('ignores late answers about the commit or file selected before', () => {
    const moved = reduceTabView(busyTab(), { type: 'showCommit', hash: 'b' });
    const late = [
      { type: 'files', hash: 'a', files: [] },
      { type: 'diff', hash: 'a', path: undefined, patch: 'a' },
      {
        type: 'fileContent',
        hash: 'a',
        path: 'x.ts',
        content: 'a',
        binary: false,
      },
    ] as const;
    for (const answer of late) {
      assert.strictEqual(reduceTabView(moved, answer), moved);
    }
    const file = reduceTabView(moved, { type: 'showFile', path: 'y.ts' });
    assert.strictEqual(
      reduceTabView(file, {
        type: 'diff',
        hash: 'b',
        path: undefined,
        patch: 'b',
      }),
      file,
    );
    assert.strictEqual(
      reduceTabView(file, { type: 'diff', hash: 'b', path: 'y.ts', patch: 'y' })
        .patch,
      'y',
    );
    const none = reduceTabView(moved, { type: 'showCommit', hash: undefined });
    assert.strictEqual(reduceTabView(none, late[0]), none);
  });

  test('drops what the previous selection showed while a file loads', () => {
    const diff = reduceTabView(busyTab(), {
      type: 'fileDiff',
      hash: 'a',
      path: 'large.json',
      diff: busyTab().diffs,
      patch: 'large',
    });
    const whole = reduceTabView(busyTab(), {
      type: 'fileContent',
      hash: 'a',
      path: 'x.ts',
      content: 'x',
      binary: false,
    });
    for (const before of [diff, whole]) {
      const view = reduceTabView(before, { type: 'showFile', path: 'y.ts' });
      assert.strictEqual(view.patch, '');
      assert.strictEqual(view.fileContent, undefined);
      assert.strictEqual(view.largeFiles.size, 0);
      assert.ok(view.patchLoading);
    }
  });

  test('shows what the extension says is selected after another tab opens', () => {
    const cleared = openTab(busyTab(), 'two');
    const view = reduceTabView(
      reduceTabView(cleared, { type: 'files', hash: 'a', files: [] }),
      { type: 'diff', hash: 'a', path: 'x.ts', patch: 'x' },
    );
    assert.strictEqual(view.hash, 'a');
    assert.strictEqual(view.path, 'x.ts');
    assert.strictEqual(view.patch, 'x');
  });

  test('shows a whole file instead of a diff, and the other way round', () => {
    const whole = reduceTabView(busyTab(), {
      type: 'fileContent',
      hash: 'a',
      path: 'y.ts',
      content: 'y',
      binary: false,
    });
    assert.strictEqual(whole.patch, '');
    assert.strictEqual(whole.fileContent?.path, 'y.ts');
    const diff = reduceTabView(whole, {
      type: 'diff',
      hash: 'a',
      path: 'x.ts',
      patch: 'patch',
    });
    assert.strictEqual(diff.fileContent, undefined);
  });

  test('counts the diffs, which the large files are fetched again for', () => {
    const view = busyTab();
    const again = reduceTabView(view, {
      type: 'diff',
      hash: 'a',
      path: 'x.ts',
      patch: 'saved',
    });
    assert.strictEqual(again.diffs, view.diffs + 1);
    assert.deepStrictEqual(again.largeFiles, new Map());

    const answer = (diff: number) =>
      reduceTabView(again, {
        type: 'fileDiff',
        hash: 'a',
        path: 'x.ts',
        patch: '',
        diff,
      });
    assert.strictEqual(answer(view.diffs), again);
    assert.ok(answer(again.diffs).largeFiles.has('x.ts'));
    assert.strictEqual(
      reduceTabView(again, {
        type: 'fileDiff',
        hash: 'b',
        path: 'x.ts',
        patch: '',
        diff: again.diffs,
      }),
      again,
    );
  });

  test('keeps the texts sent for the current diff, until the next diff', () => {
    const view = reduceTabView(busyTab(), {
      type: 'diff',
      hash: 'a',
      path: 'x.ts',
      patch: 'x',
    });
    const answer = (hash: string, diff: number) =>
      reduceTabView(view, {
        type: 'texts',
        hash,
        diff,
        texts: [
          { path: 'x.ts', side: 'old', blob: '1', text: 'old' },
          { path: 'x.ts', side: 'new', blob: '2', text: undefined },
        ],
      });
    const answered = answer('a', view.diffs);
    assert.deepStrictEqual(answered.texts, new Map([['old:x.ts', 'old']]));
    assert.strictEqual(answer('a', view.diffs - 1), view);
    assert.strictEqual(answer('b', view.diffs), view);
    const next = reduceTabView(answered, {
      type: 'diff',
      hash: 'a',
      path: 'x.ts',
      patch: 'y',
    });
    assert.deepStrictEqual(next.texts, new Map());
  });

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
