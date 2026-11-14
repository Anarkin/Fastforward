import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import type { GitToHost } from '../../../../../tools/git/shared/protocol';
import {
  createGitStore,
  fileFilterOf,
  pickedFor,
  searchQueryOf,
  shownFoldersOf,
} from '../../../../../tools/git/page/store';
import { areaKey } from '../../../../../tools/git/page/changesRows';
import { emptyTabView } from '../../../../../tools/git/page/tabView';
import { checkoutOptions } from '../../../../../tools/git/page/checkout';
import { bookmarkOptions } from '../../../../../tools/git/page/bookmarks';
import { strings } from '../../../../../lib/shared/strings';
import { compareWith } from '../../../../../tools/git/shared/comparisons';
import { commitInfo, noop } from '../../../../helpers/fixtures';
import { at, shown, labelled, posting } from './storeFixtures';

suite('Git store', () => {
  test('offers to check out a commit and to bookmark it or a ref on it, checking out and bookmarking for the worktree shown', () => {
    const posted: GitToHost[] = [];
    const refs = [
      { kind: 'branch', name: 'main', commit: at },
      { kind: 'branch', name: 'side', commit: at },
    ] as const;
    const store = createGitStore((message) => posted.push(message), {
      tab: {
        ...emptyTabView,
        root: '/repo',
        repository: { head: 'main', headCommit: at, refs, stashes: [] },
      },
    });
    const [checkout, separator, bookmark] = store
      .getState()
      .menuItems({ kind: 'commit', hash: at });
    assert.ok('separator' in separator);
    assert.ok(!('separator' in checkout) && !('separator' in bookmark));
    assert.strictEqual(checkout.label, strings.commits.checkout);
    const options = checkoutOptions(at, refs, 'main', undefined);
    assert.deepStrictEqual(
      labelled(checkout.submenu),
      options.map((option) => option.label),
    );
    const side = checkout.submenu?.[1];
    assert.ok(side !== undefined && !('separator' in side));
    side.onClick?.();
    const marks = bookmarkOptions(at, refs);
    assert.deepStrictEqual(
      labelled(bookmark.submenu),
      marks.map((option) => option.label),
    );
    const first = bookmark.submenu?.[0];
    assert.ok(first !== undefined && !('separator' in first));
    first.onClick?.();
    assert.deepStrictEqual(store.getState().bookmarks, [marks[0].bookmark]);
    assert.deepStrictEqual(posted, [
      { type: 'checkout', target: options[1].target, root: '/repo' },
      {
        type: 'setBookmarks',
        bookmarks: [marks[0].bookmark],
        root: '/repo',
      },
    ]);
    const onRef = () =>
      labelled(
        store
          .getState()
          .menuItems({ kind: 'ref', ref: { kind: 'branch', name: 'side' } }),
      );
    assert.deepStrictEqual(onRef(), [
      strings.commits.checkout,
      '-',
      strings.commits.addBookmark,
    ]);
    store.getState().toggleBookmark({ kind: 'branch', name: 'side' });
    assert.deepStrictEqual(onRef(), [
      strings.commits.checkout,
      '-',
      strings.commits.removeBookmark,
    ]);
  });

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

  test('asks the main process for the worktree shown to navigate, jump, search, fetch and load the commits, telling where the list of the worktree it was scrolled in stopped', () => {
    const { posted, store } = posting();
    store.getState().receive(shown());
    const actions = store.getState();
    actions.navigate('back', 2);
    actions.jump(at);
    actions.jump(undefined);
    actions.showUpstream();
    actions.showParent();
    vi.useFakeTimers();
    try {
      actions.lookupHash('abc');
      const stop = actions.searchCommits('fix');
      vi.advanceTimersByTime(250);
      stop();
    } finally {
      vi.useRealTimers();
    }
    actions.fetch();
    actions.toggleMerge(at);
    actions.scrolled('/other', at, 3, 1);
    actions.loadCommits(0, 50, 2);
    actions.viewFile({ path: 'a.txt', blob: 'b1' });
    const root = '/repo';
    assert.deepStrictEqual(posted, [
      { type: 'navigate', direction: 'back', steps: 2, root },
      { type: 'jump', hash: at, root },
      { type: 'showUpstream', root },
      { type: 'showParent', root },
      { type: 'lookupHash', query: 'abc', root },
      { type: 'searchCommits', query: 'fix', root },
      { type: 'stopCommitSearch', root },
      { type: 'fetch', root },
      { type: 'toggleMerge', hash: at, root },
      { type: 'scrolled', hash: at, offset: 3, report: 1, root: '/other' },
      { type: 'loadCommits', generation: 2, start: 0, count: 50, root },
      { type: 'viewFile', path: 'a.txt', blob: 'b1', root },
    ]);
  });

  test('asks the main process to open, browse, clone and make repositories, and to show or preload a worktree, whatever is shown', () => {
    const { posted, store } = posting();
    const actions = store.getState();
    actions.openRepository('/a');
    actions.browseRepositories();
    actions.openClone();
    actions.initRepository();
    actions.chooseCloneFolder('/code');
    actions.startClone({
      url: 'https://example.com/x.git',
      folder: '/code',
      name: 'x',
    });
    actions.stopClone();
    actions.selectWorktree('/b');
    actions.preloadWorktree('/b');
    assert.deepStrictEqual(posted, [
      { type: 'openRepository', root: '/a' },
      { type: 'browseRepositories' },
      { type: 'openClone' },
      { type: 'initRepository' },
      { type: 'chooseCloneFolder', folder: '/code' },
      {
        type: 'clone',
        url: 'https://example.com/x.git',
        folder: '/code',
        name: 'x',
      },
      { type: 'stopClone' },
      { type: 'selectWorktree', root: '/b' },
      { type: 'preloadWorktree', root: '/b' },
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

  test('groups the refs by their commit and knows the commits of the stashes when the repository arrives, keeping them through other messages', () => {
    const store = createGitStore(noop);
    const main = { kind: 'branch', name: 'main', commit: at } as const;
    const tag = { kind: 'tag', name: 'v1', commit: at } as const;
    store.getState().receive({
      type: 'repository',
      head: 'main',
      headCommit: at,
      refs: [main, tag],
      stashes: [{ name: 'stash@{0}', commit: 'c'.repeat(40), message: 'WIP' }],
    });
    const { refsByCommit, stashCommits } = store.getState();
    assert.deepStrictEqual(refsByCommit, new Map([[at, [main, tag]]]));
    assert.deepStrictEqual(stashCommits, new Set(['c'.repeat(40)]));
    store.getState().receive({ type: 'pulling', running: true });
    assert.strictEqual(store.getState().refsByCommit, refsByCommit);
    assert.strictEqual(store.getState().stashCommits, stashCommits);
  });

  test('indexes the refs of each kind for the search, sorted and as trees, when the repository arrives, keeping them through other messages, so the search does not index them again each time it opens', () => {
    const store = createGitStore(noop);
    const kinds = () =>
      store
        .getState()
        .refIndex.map((group) => [
          group.kind,
          group.refs.map((ref) => ref.name),
          group.tree.children.map((node) => node.name),
        ]);
    assert.deepStrictEqual(kinds(), [
      ['branch', [], []],
      ['remote', [], []],
      ['tag', [], []],
    ]);
    store.getState().receive({
      type: 'repository',
      head: 'main',
      headCommit: at,
      refs: [
        { kind: 'branch', name: 'main', commit: at },
        { kind: 'tag', name: 'v2', commit: at },
        { kind: 'branch', name: 'feat/a', commit: at },
        { kind: 'tag', name: 'v1', commit: at },
      ],
      stashes: [],
    });
    const { refIndex } = store.getState();
    assert.deepStrictEqual(kinds(), [
      ['branch', ['feat/a', 'main'], ['feat', 'main']],
      ['remote', [], []],
      ['tag', ['v1', 'v2'], ['v1', 'v2']],
    ]);
    store.getState().receive({ type: 'pulling', running: true });
    store.getState().searchFor('main');
    assert.strictEqual(store.getState().refIndex, refIndex);
  });

  test('keeps the column that has the keyboard', () => {
    const store = createGitStore(noop);
    assert.strictEqual(store.getState().activeColumn, 'commits');
    store.getState().activateColumn('files');
    assert.strictEqual(store.getState().activeColumn, 'files');
  });

  test('keeps the query searched for in each worktree, through another worktree shown', () => {
    const store = createGitStore(noop);
    store.getState().receive(shown());
    store.getState().searchFor('fix');
    assert.strictEqual(searchQueryOf(store.getState()), 'fix');
    store
      .getState()
      .receive({ type: 'worktrees', worktree: '/other', worktrees: [] });
    assert.strictEqual(searchQueryOf(store.getState()), '');
    store.getState().receive(shown());
    assert.strictEqual(searchQueryOf(store.getState()), 'fix');
  });

  test('keeps a filter of the files for each worktree, through another worktree shown, until it is cleared', () => {
    const store = createGitStore(noop);
    store.getState().receive(shown());
    store.getState().filterFiles('src');
    assert.strictEqual(fileFilterOf(store.getState()), 'src');
    store
      .getState()
      .receive({ type: 'worktrees', worktree: '/other', worktrees: [] });
    assert.strictEqual(fileFilterOf(store.getState()), undefined);
    store.getState().receive(shown());
    assert.strictEqual(fileFilterOf(store.getState()), 'src');
    store.getState().filterFiles(undefined);
    assert.strictEqual(fileFilterOf(store.getState()), undefined);
  });

  test('stops a search of the commits in the worktree it was started in, though another is shown by then', () => {
    const { posted, store } = posting();
    store.getState().receive(shown());
    vi.useFakeTimers();
    try {
      const stop = store.getState().searchCommits('fix');
      vi.advanceTimersByTime(250);
      store
        .getState()
        .receive({ type: 'worktrees', worktree: '/other', worktrees: [] });
      stop();
    } finally {
      vi.useRealTimers();
    }
    assert.deepStrictEqual(posted, [
      { type: 'searchCommits', query: 'fix', root: '/repo' },
      { type: 'stopCommitSearch', root: '/repo' },
    ]);
  });

  test('looks up a hash and searches the commits only once the typing pauses, asking nothing of what was typed past', () => {
    const { posted, store } = posting();
    store.getState().receive(shown());
    vi.useFakeTimers();
    try {
      const { lookupHash, searchCommits } = store.getState();
      lookupHash('ab')();
      searchCommits('fi')();
      vi.advanceTimersByTime(250);
      assert.deepStrictEqual(posted, []);
      lookupHash('abc');
      vi.advanceTimersByTime(149);
      assert.deepStrictEqual(posted, []);
      vi.advanceTimersByTime(1);
      searchCommits('fix');
      vi.advanceTimersByTime(250);
    } finally {
      vi.useRealTimers();
    }
    assert.deepStrictEqual(posted, [
      { type: 'lookupHash', query: 'abc', root: '/repo' },
      { type: 'searchCommits', query: 'fix', root: '/repo' },
    ]);
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
