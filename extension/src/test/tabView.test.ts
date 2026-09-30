import * as assert from 'node:assert';
import {
  emptyTabView,
  reduceTabView,
  treeToLoad,
  type TabView,
} from '../webview/tabView';
import { commitPageSize } from '../shared/protocol';
import { commitInfo, fileChange } from './fixtures';

function busyTab(): TabView {
  let view = reduceTabView(emptyTabView, {
    type: 'commits',
    generation: 1,
    total: 2,
    decorations: [],
    start: 0,
    commits: [commitInfo('a')],
    graph: [],
    workingTreeGraph: { lane: 0, color: 0, lines: [] },
    selectedIndex: 0,
    anchor: undefined,
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
  return reduceTabView(view, { type: 'error', message: 'failed' });
}

suite('Tab view', () => {
  test('starts over when another tab opens', () => {
    assert.deepStrictEqual(
      reduceTabView(busyTab(), { type: 'clear' }),
      emptyTabView,
    );
  });

  test('scrolls to the selected commit of a new history', () => {
    const view = busyTab();
    assert.deepStrictEqual(view.scrollTarget, { index: 0 });
    assert.strictEqual(view.history?.at(0)?.hash, 'a');
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

  test('knows where a revealed commit is before its page loads', () => {
    const view = reduceTabView(busyTab(), {
      type: 'reveal',
      hash: 'z',
      index: 1,
    });
    assert.strictEqual(view.history?.positionOf('z'), 1);
    assert.strictEqual(view.history?.at(1), undefined);
  });

  test('scrolls to where the history was scrolled before, over the selected commit', () => {
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
      anchor: { index: 5, offset: 3 },
    });
    assert.deepStrictEqual(view.scrollTarget, { index: 5, offset: 3 });
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
      anchor: undefined,
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

  test('shows what the extension says is selected after another tab opens', () => {
    const cleared = reduceTabView(busyTab(), { type: 'clear' });
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
    const reopened = reduceTabView(reduceTabView(asked, { type: 'clear' }), {
      type: 'showCommit',
      hash: 'a',
    });
    assert.strictEqual(treeToLoad(reopened), 'a');
  });
});
