import * as assert from 'node:assert';
import { emptyTabView, reduceTabView, type TabView } from '../webview/tabView';
import { commitInfo } from './fixtures';

// A tab with a history, a selected commit and file, and an error
function busyTab(): TabView {
  let view = reduceTabView(emptyTabView, {
    type: 'commits',
    generation: 1,
    total: 2,
    decorations: [],
    graphWidth: 1,
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
    files: [
      {
        path: 'x.ts',
        oldPath: undefined,
        status: 'M',
        insertions: 1,
        deletions: 0,
      },
    ],
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
    // What isn't about the selection stays
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
    // Only the commit list follows a page without the selected commit
    assert.strictEqual(after, before);
    const selected = reduceTabView(
      reduceTabView(after, { type: 'showCommit', hash: 'c' }),
      {
        type: 'commitPage',
        generation: 1,
        start: 2,
        commits: [commitInfo('c')],
        graph: [],
      },
    );
    assert.strictEqual(selected.historyVersion, before.historyVersion + 1);
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
    // Another file of the same commit
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
    // Nothing selected stays so
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
});
