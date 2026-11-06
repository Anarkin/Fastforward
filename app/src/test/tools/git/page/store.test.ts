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
    store.getState().receive({ type: 'recent', recent: [] });
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
});
