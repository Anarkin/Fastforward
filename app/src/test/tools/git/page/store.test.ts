import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type {
  GitToHost,
  GitToWebviewOf,
  WorktreeInfo,
} from '../../../../tools/git/shared/protocol';
import { createGitStore, detachedHead } from '../../../../tools/git/page/store';
import { noop } from '../../../fixtures';

const at = 'a'.repeat(40);

const worktree = (root: string, name: string): WorktreeInfo => ({
  root,
  name,
  folder: root,
  main: root === '/repo',
  missing: false,
});

const shown = (
  worktrees: readonly WorktreeInfo[] = [],
): GitToWebviewOf<'worktrees'> => ({
  type: 'worktrees',
  worktree: '/repo',
  worktrees,
});

const layout = (hideDimmedButtons: boolean): GitToWebviewOf<'layout'> => ({
  type: 'layout',
  columnWidths: [],
  defaultColumnWidths: [],
  collapseMerges: true,
  showEntireFile: true,
  ignoreWhitespace: true,
  diffLayout: 'sideBySide',
  showAllFiles: false,
  autoFetch: true,
  autoFetchMinutes: 1,
  hideDimmedButtons,
});

function posting() {
  const posted: GitToHost[] = [];
  return { posted, store: createGitStore((message) => posted.push(message)) };
}

suite('Git store', () => {
  test('applies the messages of the main process to the worktree shown through the tab reducer, and keeps the worktrees', () => {
    const store = createGitStore(noop);
    const worktrees = [worktree('/repo', 'main'), worktree('/side', 'side')];
    store.getState().receive(shown(worktrees));
    store.getState().receive({
      type: 'repository',
      head: 'main',
      headCommit: at,
      refs: [],
      stashes: [],
    });
    store.getState().receive({ type: 'pulling', running: true });
    const { tab } = store.getState();
    assert.strictEqual(tab.root, '/repo');
    assert.strictEqual(tab.repository?.head, 'main');
    assert.strictEqual(tab.pulling, true);
    assert.strictEqual(store.getState().worktrees, worktrees);
  });

  test('leaves its state as it was for a message that changes nothing in it, so nothing reading it draws again', () => {
    const store = createGitStore(noop);
    store.getState().receive(shown());
    const before = store.getState();
    store.getState().receive({ type: 'clearError', message: 'not shown' });
    assert.strictEqual(store.getState(), before);
  });

  test('builds the bookmarked commits, the tags the tag remote has and the branches checked out in other worktrees when their source arrives, keeping them through other messages', () => {
    const store = createGitStore(noop);
    store
      .getState()
      .receive(shown([worktree('/repo', 'main'), worktree('/side', 'side')]));
    store.getState().receive({
      type: 'repository',
      head: 'main',
      headCommit: at,
      refs: [
        { kind: 'tag', name: 'v1', commit: at },
        { kind: 'tag', name: 'v2', commit: at },
        { kind: 'remote-tag', name: 'origin/v1', commit: at, remote: 'origin' },
        { kind: 'remote-tag', name: 'second/v2', commit: at, remote: 'second' },
      ],
      stashes: [],
      tagRemote: 'origin',
    });
    store.getState().receive({
      type: 'bookmarks',
      bookmarks: [
        { kind: 'commit', name: at },
        { kind: 'branch', name: 'main' },
      ],
    });
    const built = store.getState();
    assert.deepStrictEqual(built.elsewhere, new Set(['side']));
    assert.deepStrictEqual(built.tagsOnRemote, new Set(['v1']));
    assert.deepStrictEqual(built.bookmarked, new Set([at]));
    store.getState().receive({ type: 'pulling', running: true });
    store.getState().receive(layout(true));
    const kept = store.getState();
    assert.strictEqual(kept.elsewhere, built.elsewhere);
    assert.strictEqual(kept.tagsOnRemote, built.tagsOnRemote);
    assert.strictEqual(kept.bookmarked, built.bookmarked);
    store.getState().receive({ type: 'bookmarks', bookmarks: [] });
    assert.deepStrictEqual(store.getState().bookmarked, new Set());
  });

  test('knows no tag on a remote while the tag remote is unknown', () => {
    const store = createGitStore(noop);
    store.getState().receive({
      type: 'repository',
      head: 'main',
      headCommit: at,
      refs: [
        { kind: 'remote-tag', name: 'origin/v1', commit: at, remote: 'origin' },
      ],
      stashes: [],
    });
    assert.deepStrictEqual(store.getState().tagsOnRemote, new Set());
  });

  test('hides the dimmed buttons as the layout says', () => {
    const store = createGitStore(noop);
    store.getState().receive(layout(true));
    assert.strictEqual(store.getState().hideDimmed, true);
    store.getState().receive(layout(false));
    assert.strictEqual(store.getState().hideDimmed, false);
  });

  test('posts pull, push and the pulls and pushes of a tag or another branch for the worktree shown, and nothing before one is shown', () => {
    const { posted, store } = posting();
    store.getState().pull();
    assert.deepStrictEqual(posted, []);
    store.getState().receive(shown());
    const { pull, push, pullBranch, pushBranch, pushTag } = store.getState();
    pull();
    push();
    pullBranch('side');
    pushBranch('side');
    pushTag('v1');
    assert.deepStrictEqual(posted, [
      { type: 'pull', root: '/repo' },
      { type: 'push', root: '/repo' },
      { type: 'pullBranch', name: 'side', root: '/repo' },
      { type: 'pushBranch', name: 'side', root: '/repo' },
      { type: 'pushTag', name: 'v1', root: '/repo' },
    ]);
  });

  test('changes the bookmarks at once, posting them for the worktree shown', () => {
    const { posted, store } = posting();
    store.getState().receive(shown());
    const bookmarks = [{ kind: 'commit', name: at }] as const;
    store.getState().changeBookmarks(bookmarks);
    assert.strictEqual(store.getState().bookmarks, bookmarks);
    assert.deepStrictEqual(store.getState().bookmarked, new Set([at]));
    assert.deepStrictEqual(posted, [
      { type: 'setBookmarks', bookmarks, root: '/repo' },
    ]);
  });

  test('moves the selection of the worktree shown as the page asks, before the main process answers', () => {
    const store = createGitStore(noop);
    store.getState().receive(shown());
    store.getState().dispatch({ type: 'showCommit', hash: at, selection: 1 });
    assert.strictEqual(store.getState().tab.hash, at);
    assert.strictEqual(store.getState().tab.filesLoading, true);
  });

  test('is made in the state it is given, with its collections built, as a page rendered to a string shows that state', () => {
    const store = createGitStore(noop, {
      hideDimmed: true,
      bookmarks: [{ kind: 'commit', name: at }],
      worktrees: [worktree('/side', 'side')],
    });
    assert.strictEqual(store.getInitialState().hideDimmed, true);
    assert.deepStrictEqual(store.getInitialState().bookmarked, new Set([at]));
    assert.deepStrictEqual(
      store.getInitialState().elsewhere,
      new Set(['side']),
    );
  });

  test('tells the commit of a detached HEAD, and nothing while a branch is checked out or the repository is unknown', () => {
    const detachedAt = (head: string | undefined) =>
      detachedHead(
        createGitStore(noop, {
          tab: {
            ...createGitStore(noop).getState().tab,
            repository: { head, headCommit: at, refs: [], stashes: [] },
          },
        }).getState(),
      );
    assert.strictEqual(detachedAt(undefined), at);
    assert.strictEqual(detachedAt('main'), undefined);
    assert.strictEqual(
      detachedHead(createGitStore(noop).getState()),
      undefined,
    );
  });

  test('keeps the layout the main process sends, with the column widths saved, or the default ones where they do not fit', () => {
    const store = createGitStore(noop);
    store.getState().receive({
      ...layout(false),
      columnWidths: [310],
      defaultColumnWidths: [300, 200],
      showEntireFile: false,
      diffLayout: 'inline',
    });
    const state = store.getState();
    assert.deepStrictEqual(state.columnWidths, [300, 200]);
    assert.strictEqual(state.showEntireFile, false);
    assert.strictEqual(state.diffLayout, 'inline');
    assert.strictEqual(state.collapseMerges, true);
    assert.strictEqual(state.autoFetchMinutes, 1);
    store.getState().receive({
      ...layout(false),
      columnWidths: [310, 210],
      defaultColumnWidths: [300, 200],
    });
    assert.deepStrictEqual(store.getState().columnWidths, [310, 210]);
  });

  test('changes a setting of the layout at once, telling the main process, and solo for the worktree shown', () => {
    const { posted, store } = posting();
    store.getState().receive(shown());
    const {
      changeShowEntireFile,
      changeIgnoreWhitespace,
      changeDiffLayout,
      changeShowAllFiles,
      changeCollapseMerges,
      changeAutoFetch,
      changeSolo,
    } = store.getState();
    changeShowEntireFile(true);
    changeIgnoreWhitespace(true);
    changeDiffLayout('inline');
    changeShowAllFiles(true);
    changeCollapseMerges(true);
    changeAutoFetch(true);
    changeSolo(true);
    const state = store.getState();
    assert.deepStrictEqual(
      [
        state.showEntireFile,
        state.ignoreWhitespace,
        state.diffLayout,
        state.showAllFiles,
        state.collapseMerges,
        state.autoFetch,
        state.solo,
      ],
      [true, true, 'inline', true, true, true, true],
    );
    assert.deepStrictEqual(posted, [
      { type: 'setShowEntireFile', show: true },
      { type: 'setIgnoreWhitespace', ignore: true },
      { type: 'setDiffLayout', layout: 'inline' },
      { type: 'setShowAllFiles', show: true },
      { type: 'setCollapseMerges', collapse: true },
      { type: 'setAutoFetch', on: true },
      { type: 'setSolo', solo: true, root: '/repo' },
    ]);
    store.getState().receive({ type: 'solo', solo: false });
    assert.strictEqual(store.getState().solo, false);
  });

  test('resizes a column and resets it to its default width, telling the main process', () => {
    const { posted, store } = posting();
    store.getState().receive({
      ...layout(false),
      columnWidths: [310, 210],
      defaultColumnWidths: [300, 200],
    });
    store.getState().resizeColumns([320, 220]);
    store.getState().resetColumn(1);
    assert.deepStrictEqual(store.getState().columnWidths, [320, 200]);
    assert.deepStrictEqual(posted, [
      { type: 'setColumnWidths', widths: [320, 220] },
      { type: 'setColumnWidths', widths: [320, 200] },
    ]);
  });

  test('keeps the comparison shown and the texts loaded for it, starting the texts anew for another comparison', () => {
    const { posted, store } = posting();
    const compared = {
      tab: 'c1',
      old: '/a.txt',
      new: '/b.txt',
      name: 'b.txt',
      patch: '',
      version: 1,
      entire: true,
    };
    store.getState().receive({ type: 'compare', compare: compared });
    assert.strictEqual(store.getState().compare, compared);
    const loaded = (tab: string, path: string) =>
      store.getState().receive({
        type: 'compareTexts',
        tab,
        texts: [{ path, side: 'new', blob: 'b', text: 'text' }],
      });
    loaded('c1', 'a.txt');
    loaded('c1', 'b.txt');
    assert.strictEqual(store.getState().compareTexts.tab, 'c1');
    assert.strictEqual(store.getState().compareTexts.texts.size, 2);
    loaded('c2', 'a.txt');
    assert.strictEqual(store.getState().compareTexts.tab, 'c2');
    assert.strictEqual(store.getState().compareTexts.texts.size, 1);
    store
      .getState()
      .loadCompareTexts([{ path: 'a.txt', side: 'old', blob: 'a' }]);
    assert.deepStrictEqual(posted, [
      {
        type: 'loadCompareTexts',
        requests: [{ path: 'a.txt', side: 'old', blob: 'a' }],
      },
    ]);
  });

  test('keeps the recent repositories, forgetting one at once and telling the main process', () => {
    const { posted, store } = posting();
    const recent = [
      { root: '/a', name: 'a', folder: '/' },
      { root: '/b', name: 'b', folder: '/' },
    ];
    store.getState().receive({ type: 'recent', recent });
    store.getState().forgetRecent('/a');
    assert.deepStrictEqual(store.getState().recent, [recent[1]]);
    assert.deepStrictEqual(posted, [{ type: 'forgetRecent', root: '/a' }]);
  });

  test('asks whether to make a repository inside another, making it only once confirmed', () => {
    const { posted, store } = posting();
    const asked = {
      type: 'confirmInit',
      folder: '/a/b',
      repository: '/a',
    } as const;
    store.getState().receive(asked);
    assert.strictEqual(store.getState().initAsked, asked);
    store.getState().answerInit(false);
    assert.strictEqual(store.getState().initAsked, undefined);
    store.getState().receive(asked);
    store.getState().answerInit(true);
    assert.deepStrictEqual(posted, [{ type: 'initInside', folder: '/a/b' }]);
  });

  test('shows the clone form anew each time it opens, without the folder chosen for the last, and closes it, telling the main process', () => {
    const { posted, store } = posting();
    const form = { kind: 'form', url: '', folder: '/', name: '' } as const;
    store.getState().receive({ type: 'clone', view: form });
    const first = store.getState().clone.form;
    store.getState().receive({ type: 'cloneFolder', folder: '/code' });
    store
      .getState()
      .receive({ type: 'cloneTarget', folder: '/code', name: 'x' });
    assert.deepStrictEqual(store.getState().clone.folder, { folder: '/code' });
    assert.deepStrictEqual(store.getState().clone.target, {
      type: 'cloneTarget',
      folder: '/code',
      name: 'x',
    });
    store.getState().receive({ type: 'clone', view: form });
    assert.strictEqual(store.getState().clone.form, first + 1);
    assert.strictEqual(store.getState().clone.folder, undefined);
    store.getState().closeClone();
    assert.strictEqual(store.getState().clone.view, undefined);
    assert.deepStrictEqual(posted, [{ type: 'closeClone' }]);
  });

  test('keeps when the last fetch succeeded and failed', () => {
    const store = createGitStore(noop);
    store.getState().receive({ type: 'lastFetch', succeeded: 5, failed: 3 });
    assert.deepStrictEqual(store.getState().lastFetch, {
      type: 'lastFetch',
      succeeded: 5,
      failed: 3,
    });
  });

  test('hides and shows the commit column, and opens and closes the search over it, on the page alone', () => {
    const { posted, store } = posting();
    assert.strictEqual(store.getState().commitsShown, true);
    store.getState().toggleCommits();
    assert.strictEqual(store.getState().commitsShown, false);
    store.getState().search(true);
    assert.strictEqual(store.getState().searching, true);
    store.getState().search(false);
    store.getState().toggleCommits();
    assert.deepStrictEqual(
      [store.getState().commitsShown, store.getState().searching],
      [true, false],
    );
    assert.deepStrictEqual(posted, []);
  });
});
