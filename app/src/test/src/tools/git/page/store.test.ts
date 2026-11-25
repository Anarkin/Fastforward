import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import { plainSearch } from '../../../../../lib/shared/searchOptions';
import { createGitStore } from '../../../../../tools/git/page/store';
import {
  activeColumnOf,
  commitsShownOf,
  detachedHead,
} from '../../../../../tools/git/page/selectors';
import { noop } from '../../../../helpers/fixtures';
import {
  at,
  worktree,
  shown,
  layout,
  posting,
  labelled,
} from './storeFixtures';
import type { GitToHost } from '../../../../../tools/git/shared/protocol';
import { emptyTabView } from '../../../../../tools/git/page/shownTab';
import { CommitHistory } from '../../../../../tools/git/page/commitHistory';
import { workingTreeHash } from '../../../../../lib/shared/changes';
import { fileChange } from '../../../../helpers/gitValues';
import { checkoutOptions } from '../../../../../tools/git/page/checkout';
import { bookmarkOptions } from '../../../../../tools/git/page/bookmarks';
import { strings } from '../../../../../lib/shared/strings';

const detachedAt = (head: string | undefined) =>
  detachedHead(
    createGitStore(noop, {
      tab: {
        ...createGitStore(noop).getState().tab,
        repository: { head, headCommit: at, refs: [], stashes: [] },
      },
    }).getState(),
  );

function viewed(hash: string) {
  const posted: GitToHost[] = [];
  const store = createGitStore((message) => posted.push(message), {
    tab: {
      ...emptyTabView,
      root: '/repo',
      history: new CommitHistory(0),
      hash,
      files: [
        fileChange('src/a.ts'),
        fileChange('src/gone.ts', { status: 'D' }),
      ],
    },
  });
  store.getState().viewFile({ path: 'src/a.ts', blob: 'b'.repeat(40) });
  store.getState().viewFile({ path: 'src/gone.ts', blob: 'c'.repeat(40) });
  return posted;
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
    store.getState().receive(layout());
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
      bookmarks: [{ kind: 'commit', name: at }],
      worktrees: [worktree('/side', 'side')],
    });
    assert.deepStrictEqual(store.getInitialState().bookmarked, new Set([at]));
    assert.deepStrictEqual(
      store.getInitialState().elsewhere,
      new Set(['side']),
    );
  });

  test('tells the commit of a detached HEAD, and nothing while a branch is checked out or the repository is unknown', () => {
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
      ...layout(),
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
      ...layout(),
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
      ...layout(),
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
    store.getState().checkCloneTarget('/code', 'x')();
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

  test('checks the folder to clone into once the typing pauses, asking nothing of what was typed past', () => {
    const { posted, store } = posting();
    vi.useFakeTimers();
    try {
      const { checkCloneTarget } = store.getState();
      checkCloneTarget('/code', 'r')();
      vi.advanceTimersByTime(150);
      checkCloneTarget('/code', 're');
      vi.advanceTimersByTime(149);
      assert.deepStrictEqual(posted, []);
      vi.advanceTimersByTime(1);
    } finally {
      vi.useRealTimers();
    }
    assert.deepStrictEqual(posted, [
      { type: 'checkCloneTarget', folder: '/code', name: 're' },
    ]);
  });

  test('takes the answer to the last check of the folder to clone into alone, as the main process may answer an earlier check after it, keeping what it found while it is checked again', () => {
    const store = createGitStore(noop);
    const ask = (name: string) =>
      store.getState().checkCloneTarget('/code', name)();
    const answer = (name: string, problem?: string) =>
      store.getState().receive({
        type: 'cloneTarget',
        folder: '/code',
        name,
        ...(problem !== undefined && { problem }),
      });
    ask('rep');
    ask('repo');
    answer('repo', 'taken');
    answer('rep');
    assert.strictEqual(store.getState().clone.target?.name, 'repo');
    assert.strictEqual(store.getState().clone.target?.problem, 'taken');
    ask('repo');
    assert.strictEqual(store.getState().clone.target?.problem, 'taken');
    ask('repo2');
    answer('repo', 'taken');
    assert.deepStrictEqual(store.getState().clone.target, {
      folder: '/code',
      name: 'repo2',
    });
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

  test('hides and shows the commit column on the page alone', () => {
    const { posted, store } = posting();
    store.getState().receive(shown());
    posted.length = 0;
    assert.strictEqual(commitsShownOf(store.getState()), true);
    store.getState().toggleCommits();
    assert.strictEqual(commitsShownOf(store.getState()), false);
    store.getState().toggleCommits();
    assert.strictEqual(commitsShownOf(store.getState()), true);
    assert.deepStrictEqual(posted, []);
  });

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
      const stop = actions.searchCommits('fix', plainSearch);
      vi.advanceTimersByTime(250);
      stop();
    } finally {
      vi.useRealTimers();
    }
    actions.fetch();
    actions.refresh();
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
      { type: 'searchCommits', query: 'fix', options: plainSearch, root },
      { type: 'stopCommitSearch', root },
      { type: 'fetch', root },
      { type: 'refresh', root },
      { type: 'toggleMerge', hash: at, root },
      { type: 'scrolled', hash: at, offset: 3, report: 1, root: '/other' },
      { type: 'loadCommits', generation: 2, start: 0, count: 50, root },
      { type: 'viewFile', path: 'a.txt', blob: 'b1', root },
    ]);
  });

  test('views a file of a commit as the version the commit shows, a file it deleted as its parent had it, and a file of the working tree from disk', () => {
    const root = '/repo';
    assert.deepStrictEqual(viewed(at), [
      { type: 'viewFile', path: 'src/a.ts', rev: at, root },
      { type: 'viewFile', path: 'src/gone.ts', rev: `${at}^`, root },
    ]);
    assert.deepStrictEqual(viewed(workingTreeHash), [
      { type: 'viewFile', path: 'src/a.ts', blob: 'b'.repeat(40), root },
      { type: 'viewFile', path: 'src/gone.ts', rev: 'HEAD', root },
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

  test('keeps the column that has the keyboard', () => {
    const store = createGitStore(noop);
    store.getState().receive(shown());
    assert.strictEqual(activeColumnOf(store.getState()), 'commits');
    store.getState().activateColumn('files');
    assert.strictEqual(activeColumnOf(store.getState()), 'files');
  });
});

suite('Measures of the diff kept for the next diff shown', () => {
  const measures = {
    charWidth: 7.2,
    font: '12px mono',
    spacing: 0,
    scale: 1.25,
    lineHeight: 18,
  };

  test('keeps the text a diff measured for the diff shown next, as each diff shown measured its text anew and styled every row it drew again once it had, and keeps them as they were when measured alike, so nothing draws again', () => {
    const store = createGitStore(noop);
    store.getState().measureDiffText(measures);
    const kept = store.getState().diffMeasures.text;
    assert.deepStrictEqual(kept, measures);

    store.getState().measureDiffText({ ...measures });
    assert.strictEqual(store.getState().diffMeasures.text, kept);

    store.getState().measureDiffText({ ...measures, scale: 1.5 });
    assert.strictEqual(store.getState().diffMeasures.text?.scale, 1.5);
  });

  test('keeps the snap of the code and the columns lines wrap at, as they were when measured alike', () => {
    const store = createGitStore(noop);
    const snap = { inline: 0.2, left: 0, right: -0.2 };
    store.getState().snapDiffCode(() => snap);
    assert.strictEqual(store.getState().diffMeasures.snap, snap);
    store.getState().snapDiffCode((last) => last);
    assert.strictEqual(store.getState().diffMeasures.snap, snap);

    store.getState().keepWrapColumns({ left: 80, right: 79 });
    const columns = store.getState().diffMeasures.wrapColumns;
    store.getState().keepWrapColumns({ left: 80, right: 79 });
    assert.strictEqual(store.getState().diffMeasures.wrapColumns, columns);
    assert.deepStrictEqual(columns, { left: 80, right: 79 });
  });
});
