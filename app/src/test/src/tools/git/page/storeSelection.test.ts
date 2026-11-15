import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import { createGitStore } from '../../../../../tools/git/page/store';
import {
  pickedFor,
  shownFoldersOf,
} from '../../../../../tools/git/page/gitSelectors';
import { areaKey } from '../../../../../tools/git/page/changesRows';
import { compareWith } from '../../../../../tools/git/shared/comparisons';
import { noop } from '../../../../helpers/fixtures';
import { at, shown, posting } from './storeFixtures';
import { commitInfo } from '../../../../helpers/gitValues';

suite('Git store', () => {
  test('keeps the language picked for the file it was picked for, and none for another or once picked again', () => {
    const store = createGitStore(noop);
    store.getState().pickLanguage('one', 'python');
    assert.strictEqual(pickedFor('one')(store.getState()), 'python');
    assert.strictEqual(pickedFor('two')(store.getState()), undefined);
    assert.strictEqual(pickedFor(undefined)(store.getState()), undefined);
    store.getState().pickLanguage('one', undefined);
    assert.strictEqual(pickedFor('one')(store.getState()), undefined);
    store.getState().pickLanguage(undefined, 'python');
    assert.strictEqual(store.getState().pickedLanguage, undefined);
  });

  test('forgets the language picked for a file once another is shown, so it is chosen anew on coming back, but keeps it while the same file is shown again', () => {
    const store = createGitStore(noop);
    store.getState().pickLanguage('one', 'python');
    store.getState().seeLanguageKey('one');
    assert.strictEqual(pickedFor('one')(store.getState()), 'python');
    store.getState().seeLanguageKey('two');
    store.getState().seeLanguageKey('one');
    assert.strictEqual(pickedFor('one')(store.getState()), undefined);
  });

  test('selects a commit at once and asks the main process for it, holding the ask while a key repeats, unselecting the one selected again, and comparing another with it', () => {
    vi.useFakeTimers();
    try {
      const { posted, store } = posting();
      store.getState().receive(shown());
      const other = 'b'.repeat(40);
      store.getState().selectCommit(at);
      assert.strictEqual(store.getState().tab.hash, at);
      store.getState().selectCommit(at, true);
      assert.strictEqual(store.getState().tab.hash, undefined);
      store.getState().selectCommit(other, false, true);
      assert.strictEqual(posted.length, 2);
      vi.runAllTimers();
      store.getState().compareCommit(at);
      assert.deepStrictEqual(posted, [
        {
          type: 'selectCommit',
          hash: at,
          replace: false,
          selection: 1,
          root: '/repo',
        },
        {
          type: 'selectCommit',
          hash: undefined,
          replace: true,
          selection: 2,
          root: '/repo',
        },
        {
          type: 'selectCommit',
          hash: other,
          replace: false,
          selection: 3,
          root: '/repo',
        },
        {
          type: 'selectCommit',
          hash: compareWith(other, at),
          replace: false,
          selection: 4,
          root: '/repo',
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  test('reads ahead the diff of the next commit the way the last step went once the diff of the one selected comes, then the whole texts of its sides, so the page colors it before it is shown, but not for a file selected', () => {
    const { posted, store } = posting();
    store.getState().receive(shown());
    const [first, second, third] = ['1', '2', '3'].map((digit) =>
      digit.repeat(40),
    );
    store.getState().receive({
      type: 'commits',
      generation: 1,
      total: 3,
      decorations: [],
      start: 0,
      commits: [first, second, third].map((hash) => commitInfo(hash)),
      graph: [],
      workingTreeGraph: { lane: 0, color: 0, lines: [] },
      selectedIndex: undefined,
      scrollTarget: undefined,
    });
    const show = (hash: string, path?: string) => {
      store.getState().selectCommit(hash);
      store.getState().receive({ type: 'diff', hash, path, patch: '' });
    };
    show(first);
    show(third);
    show(second);
    show(third, 'a.ts');
    const old = 'a'.repeat(40);
    const changed = 'b'.repeat(40);
    store.getState().receive({
      type: 'prefetchedDiff',
      hash: first,
      patch: [
        'diff --git a/a.ts b/a.ts',
        `index ${old}..${changed} 100644`,
        '--- a/a.ts',
        '+++ b/a.ts',
        '@@ -3,1 +3,1 @@',
        '-old = 1;',
        '+new = 2;',
        '',
      ].join('\n'),
    });
    assert.deepStrictEqual(
      posted.filter(({ type }) => type.startsWith('prefetch')),
      [
        { type: 'prefetchDiff', hash: second, root: '/repo' },
        { type: 'prefetchDiff', hash: first, root: '/repo' },
        {
          type: 'prefetchTexts',
          hash: first,
          texts: [
            { path: 'a.ts', side: 'old', blob: old },
            { path: 'a.ts', side: 'new', blob: changed },
          ],
          root: '/repo',
        },
      ],
    );
  });

  test('loads the diff, the texts and a file of the commit selected, asking nothing while none is, nor anything before a worktree is shown', () => {
    const { posted, store } = posting();
    store.getState().navigate('back', 1);
    store.getState().receive(shown());
    const actions = store.getState();
    actions.loadFileDiff('a.txt');
    actions.loadTexts([{ path: 'a.txt', side: 'new', blob: 'b1' }]);
    actions.selectFile('a.txt');
    assert.deepStrictEqual(posted, []);
    store.getState().selectCommit(at);
    posted.length = 0;
    const { diffs } = store.getState().tab;
    actions.loadFileDiff('a.txt');
    actions.loadTexts([{ path: 'a.txt', side: 'new', blob: 'b1' }]);
    actions.selectFile('a.txt', 'staged');
    assert.strictEqual(store.getState().tab.path, 'a.txt');
    assert.deepStrictEqual(posted, [
      {
        type: 'loadFileDiff',
        hash: at,
        path: 'a.txt',
        diff: diffs,
        root: '/repo',
      },
      {
        type: 'loadTexts',
        hash: at,
        diff: diffs,
        texts: [{ path: 'a.txt', side: 'new', blob: 'b1' }],
        root: '/repo',
      },
      {
        type: 'selectFile',
        hash: at,
        path: 'a.txt',
        area: 'staged',
        root: '/repo',
      },
    ]);
  });

  test('asks once for the tree of a commit shown with all its files, after the commit it was selected with', () => {
    vi.useFakeTimers();
    try {
      const { posted, store } = posting();
      store.getState().receive(shown());
      store.getState().selectCommit(at, false, true);
      store.getState().requestTree(at);
      assert.strictEqual(store.getState().tab.treeRequested, at);
      assert.strictEqual(posted.length, 0);
      vi.runAllTimers();
      assert.deepStrictEqual(
        posted.map((message) => message.type),
        ['selectCommit', 'loadTree'],
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test('forgets the folders toggled for a commit once another is shown, so they open again on coming back to it', () => {
    const store = createGitStore(noop);
    store.getState().receive(shown());
    store.getState().selectCommit(at);
    store.getState().toggleFolder('closed', 'src');
    store.getState().selectCommit('b'.repeat(40));
    store.getState().selectCommit(at);
    assert.deepStrictEqual(shownFoldersOf(store.getState()).closed, new Set());
  });

  test('opens and closes the folders of the commit shown, none for another commit, and opens those of a file selected while all files are shown', () => {
    const store = createGitStore(noop);
    store.getState().receive(shown());
    store.getState().selectCommit(at);
    store.getState().toggleFolder('open', 'src');
    store.getState().toggleFolder('closed', 'docs');
    assert.deepStrictEqual(shownFoldersOf(store.getState()), {
      view: JSON.stringify(['/repo', at]),
      open: new Set(['src']),
      closed: new Set(['docs']),
    });
    store.getState().selectCommit('b'.repeat(40));
    assert.deepStrictEqual(shownFoldersOf(store.getState()).open, new Set());
    store.getState().changeShowAllFiles(true);
    store.getState().dispatch({ type: 'showFile', path: 'src/a/b.ts' });
    assert.deepStrictEqual(
      shownFoldersOf(store.getState()).open,
      new Set([areaKey(undefined, 'src'), areaKey(undefined, 'src/a')]),
    );
    store
      .getState()
      .replaceFolders({ open: new Set(['x']), closed: new Set() });
    assert.deepStrictEqual(
      shownFoldersOf(store.getState()).open,
      new Set(['x']),
    );
  });
});
