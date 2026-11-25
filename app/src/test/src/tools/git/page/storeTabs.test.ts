import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { createGitStore } from '../../../../../tools/git/page/store';
import {
  activeColumnOf,
  commitsShownOf,
  fileCursorOf,
  fileFoldsOf,
  folderViewOf,
  languageKeyOf,
  tabScopeOf,
  shownFoldersOf,
} from '../../../../../tools/git/page/selectors';
import {
  diffFindOf,
  pickedFor,
} from '../../../../../components/diff/page/slice';
import { emptyTabView } from '../../../../../tools/git/page/shownTab';
import { plainSearch } from '../../../../../lib/shared/searchOptions';
import { noop } from '../../../../helpers/fixtures';
import { at, shown } from './storeFixtures';

const showing = (worktree: string | undefined) => ({
  type: 'worktrees' as const,
  worktree,
  worktrees: [],
});

const filesOf = (hash: string) => ({
  type: 'files' as const,
  hash,
  files: [],
});

suite('Git store, for each tab', () => {
  test('keeps the commit column hidden in the worktree it was left in, through another worktree or tool shown, leaving the other worktrees as they were', () => {
    const store = createGitStore(noop);
    const looks = () => commitsShownOf(store.getState());
    store.getState().receive(shown());
    store.getState().toggleCommits();
    assert.strictEqual(looks(), false);
    store.getState().receive(showing('/other'));
    assert.strictEqual(looks(), true);
    store.getState().receive(showing(undefined));
    assert.strictEqual(looks(), true);
    store.getState().receive(shown());
    assert.strictEqual(looks(), false);
    store.getState().toggleCommits();
    assert.strictEqual(looks(), true);
  });

  test('keeps the column that has the keyboard in each worktree, the commits in one never shown yet', () => {
    const store = createGitStore(noop);
    store.getState().receive(shown());
    assert.strictEqual(activeColumnOf(store.getState()), 'commits');
    store.getState().activateColumn('diff');
    store.getState().receive(showing('/other'));
    assert.strictEqual(activeColumnOf(store.getState()), 'commits');
    store.getState().activateColumn('files');
    store.getState().receive(showing(undefined));
    store.getState().receive(shown());
    assert.strictEqual(activeColumnOf(store.getState()), 'diff');
    store.getState().receive(showing('/other'));
    assert.strictEqual(activeColumnOf(store.getState()), 'files');
  });

  test('keeps the find of the diff of each worktree open with its query and options through another worktree shown, each apart from the others, until it is closed, keeping its options then', () => {
    const store = createGitStore(noop);
    const repository = tabScopeOf('/repo');
    const compared = tabScopeOf('/third');
    assert.notStrictEqual(repository, compared);
    const regex = { ...plainSearch, regex: true };
    store.getState().keepDiffFind(repository, {
      finding: true,
      search: { query: 'adam', options: regex },
    });
    assert.deepStrictEqual(diffFindOf(compared)(store.getState()), {
      finding: false,
      search: { query: '', options: plainSearch },
    });
    store.getState().receive(showing('/other'));
    store.getState().receive(showing(undefined));
    assert.deepStrictEqual(diffFindOf(repository)(store.getState()), {
      finding: true,
      search: { query: 'adam', options: regex },
    });
    store.getState().closeDiffFind(repository);
    assert.deepStrictEqual(diffFindOf(repository)(store.getState()), {
      finding: false,
      search: { query: '', options: regex },
    });
  });

  test('keeps where the diff of each selection of each tab was left, scrolled, folded and at which match, a change at a time, through other tabs and selections', () => {
    const store = createGitStore(noop);
    const { diffPlaceOf, keepDiffPlace } = store.getState();
    assert.strictEqual(diffPlaceOf('/repo', 'one'), undefined);
    keepDiffPlace('/repo', 'one', { top: 120, sideways: 8 });
    keepDiffPlace('/repo', 'one', { current: 3 });
    keepDiffPlace('/repo', 'two', { toggled: new Map([['a.txt', false]]) });
    keepDiffPlace('/other', 'one', { sideways: 40 });
    store.getState().receive(showing('/other'));
    assert.deepStrictEqual(diffPlaceOf('/repo', 'one'), {
      top: 120,
      anchor: undefined,
      sideways: 8,
      toggled: new Map(),
      current: 3,
      currentFor: { query: '', options: plainSearch },
    });
    assert.deepStrictEqual(
      diffPlaceOf('/repo', 'two')?.toggled,
      new Map([['a.txt', false]]),
    );
    assert.strictEqual(diffPlaceOf('/other', 'one')?.sideways, 40);
    assert.strictEqual(diffPlaceOf('/other', 'two'), undefined);
  });

  test('keeps the language picked for the file shown in each tab while other tabs, files and none are shown, until another file is shown in that tab', () => {
    const store = createGitStore(noop);
    const tab = { ...emptyTabView, hash: 'a'.repeat(40), path: 'a.txt' };
    const repository = languageKeyOf({ ...tab, root: '/repo' });
    const other = languageKeyOf({ ...tab, root: '/other' });
    const compared = languageKeyOf({ ...tab, root: '/third' });
    const { pickLanguage, seeLanguageKey } = store.getState();
    pickLanguage(repository, 'python');
    pickLanguage(compared, 'rust');
    seeLanguageKey(undefined);
    seeLanguageKey(other);
    seeLanguageKey(compared);
    assert.deepStrictEqual(
      [repository, other, compared].map((key) =>
        pickedFor(key)(store.getState()),
      ),
      ['python', undefined, 'rust'],
    );
    seeLanguageKey(languageKeyOf({ ...tab, root: '/repo', path: 'b.txt' }));
    seeLanguageKey(repository);
    assert.strictEqual(pickedFor(repository)(store.getState()), undefined);
  });

  test('keeps the folders opened and closed in the files of each worktree, its folders folded while filtering, its keyboard cursor and its scroll through another worktree shown, until another commit is shown in it', () => {
    const store = createGitStore(noop);
    store.getState().receive(shown());
    store.getState().receive(filesOf(at));
    const view = folderViewOf(store.getState().tab);
    store.getState().toggleFolder('closed', 'src');
    store.getState().foldFilesWhileFiltering({
      view,
      searched: '[]',
      closed: new Set(['lib']),
    });
    store
      .getState()
      .moveFilesCursor({ key: 'folder:src', from: undefined, view });
    store.getState().keepFilesScroll(view, 80);
    const looks = () => {
      const state = store.getState();
      return [
        [...shownFoldersOf(state).closed],
        [...(fileFoldsOf(state)?.closed ?? [])],
        fileCursorOf(state)?.key,
      ];
    };
    store.getState().receive(showing('/other'));
    store.getState().receive(filesOf(at));
    assert.deepStrictEqual(looks(), [[], [], undefined]);
    store.getState().receive(showing('/repo'));
    store.getState().receive(filesOf(at));
    assert.deepStrictEqual(looks(), [['src'], ['lib'], 'folder:src']);
    assert.strictEqual(store.getState().filesScrollOf(view), 80);
    store.getState().receive(filesOf('b'.repeat(40)));
    assert.deepStrictEqual(shownFoldersOf(store.getState()).closed, new Set());
  });

  test('shows the commits a search and a hash lookup found in a worktree at once once it is shown again, rather than searching anew in the meantime, through another worktree or tool shown', () => {
    const store = createGitStore(noop);
    const found = {
      type: 'commitSearch' as const,
      query: 'second',
      options: plainSearch,
      result: { commits: [], capped: false },
    };
    const lookup = {
      type: 'hashLookup' as const,
      query: 'abcd',
      result: { commits: [], more: 0 },
    };
    store.getState().receive(shown());
    store.getState().receive(found);
    store.getState().receive(lookup);
    store.getState().receive(showing('/other'));
    assert.deepStrictEqual(
      [store.getState().tab.commitSearch, store.getState().tab.hashLookup],
      [undefined, undefined],
    );
    store.getState().receive(showing(undefined));
    store.getState().receive(shown());
    assert.deepStrictEqual(
      [store.getState().tab.commitSearch, store.getState().tab.hashLookup],
      [found, lookup],
    );
  });
});
