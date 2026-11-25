import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import { plainSearch } from '../../../../../lib/shared/searchOptions';
import { createGitStore } from '../../../../../tools/git/page/store';
import { fileFilterOf } from '../../../../../tools/git/page/selectors';
import { noop } from '../../../../helpers/fixtures';
import { at, shown, posting } from './storeFixtures';

suite('Git store', () => {
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
    store.getState().filterCommits('main');
    assert.strictEqual(store.getState().refIndex, refIndex);
  });

  test('keeps a filter of the files for each worktree, through another worktree shown, until it is cleared', () => {
    const store = createGitStore(noop);
    store.getState().receive(shown());
    store.getState().filterFiles('src');
    assert.strictEqual(fileFilterOf(store.getState())?.query, 'src');
    store
      .getState()
      .receive({ type: 'worktrees', worktree: '/other', worktrees: [] });
    assert.strictEqual(fileFilterOf(store.getState()), undefined);
    store.getState().receive(shown());
    assert.strictEqual(fileFilterOf(store.getState())?.query, 'src');
    store.getState().filterFiles(undefined);
    assert.strictEqual(fileFilterOf(store.getState()), undefined);
  });

  test('stops a search of the commits in the worktree it was started in, though another is shown by then', () => {
    const { posted, store } = posting();
    store.getState().receive(shown());
    vi.useFakeTimers();
    try {
      const stop = store.getState().searchCommits('fix', plainSearch);
      vi.advanceTimersByTime(250);
      store
        .getState()
        .receive({ type: 'worktrees', worktree: '/other', worktrees: [] });
      stop();
    } finally {
      vi.useRealTimers();
    }
    assert.deepStrictEqual(posted, [
      {
        type: 'searchCommits',
        query: 'fix',
        options: plainSearch,
        root: '/repo',
      },
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
      searchCommits('fi', plainSearch)();
      vi.advanceTimersByTime(250);
      assert.deepStrictEqual(posted, []);
      lookupHash('abc');
      vi.advanceTimersByTime(149);
      assert.deepStrictEqual(posted, []);
      vi.advanceTimersByTime(1);
      searchCommits('fix', plainSearch);
      vi.advanceTimersByTime(250);
    } finally {
      vi.useRealTimers();
    }
    assert.deepStrictEqual(posted, [
      { type: 'lookupHash', query: 'abc', root: '/repo' },
      {
        type: 'searchCommits',
        query: 'fix',
        options: plainSearch,
        root: '/repo',
      },
    ]);
  });
});
