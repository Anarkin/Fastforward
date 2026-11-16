import * as assert from 'node:assert';
import { afterEach, beforeEach, suite, test, vi } from 'vitest';
import type { StoreApi } from 'zustand';
import { plainSearch } from '../../../../../lib/shared/searchOptions';
import type { GitState } from '../../../../../tools/git/page/gitState';
import {
  activeColumnOf,
  commitsShownOf,
  compareLanguageKey,
  diffFindOf,
  fileCursorOf,
  fileFilterOf,
  fileFoldsOf,
  folderViewOf,
  languageKeyOf,
  locationsOf,
  pickedFor,
  searchOf,
  searchingOf,
  shownFoldersOf,
  tabScopeOf,
} from '../../../../../tools/git/page/gitSelectors';
import { emptyTabView } from '../../../../../tools/git/page/tabView';
import type { GitToHost } from '../../../../../tools/git/shared/protocol';
import { at, compare, posting, shown } from './storeFixtures';

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

const keptSent = (posted: readonly GitToHost[]) =>
  posted.flatMap((message) =>
    message.type === 'keepTab' || message.type === 'keepCompare'
      ? [{ ...message, kept: JSON.parse(message.kept) as unknown }]
      : [],
  );

const scope = tabScopeOf(undefined, '/repo');

const view = folderViewOf({ ...emptyTabView, root: '/repo', hash: at });

const languageKey = languageKeyOf(undefined, {
  ...emptyTabView,
  root: '/repo',
  hash: at,
  path: 'a.txt',
});

const looks = (store: StoreApi<GitState>) => {
  const state = store.getState();
  return {
    commitsShown: commitsShownOf(state),
    searching: searchingOf(state),
    search: searchOf(state),
    column: activeColumnOf(state),
    filter: fileFilterOf(state),
    folders: shownFoldersOf(state),
    folds: fileFoldsOf(state),
    cursor: fileCursorOf(state),
    pin: state.pinnedMessages.get('/repo'),
    locations: locationsOf(state),
    locationsScroll: state.locationsScrollOf(),
    filesScroll: state.filesScrollOf(view),
    find: diffFindOf(scope)(state),
    focus: state.keptFocusOf(scope),
    place: state.diffPlaceOf(scope, at),
    language: pickedFor(languageKey)(state),
  };
};

function leftAsWorked(store: StoreApi<GitState>): void {
  const state = () => store.getState();
  state().receive(shown());
  state().receive(filesOf(at));
  state().toggleCommits();
  state().search(true);
  state().searchFor('adam', { ...plainSearch, wholeWord: true });
  state().activateColumn('diff');
  state().filterFiles('src', plainSearch);
  state().toggleFolder('closed', 'src');
  state().foldFilesWhileFiltering({
    view,
    searched: '[]',
    closed: new Set(['lib']),
  });
  state().moveFilesCursor({ key: 'folder:src', from: undefined, view });
  state().pinMessage({ hash: at, byKey: true });
  state().keepLocations({
    highlight: { query: 'adam', key: 'branch:main' },
    toggled: new Set(['branch:feat']),
  });
  state().keepLocationsScroll(48);
  state().keepFilesScroll(view, 80);
  state().keepDiffFind(scope, {
    finding: true,
    search: { query: 'eve', options: { ...plainSearch, regex: true } },
  });
  state().keepFocus(scope, { name: 'diff-find', selection: [1, 2, 'forward'] });
  state().keepDiffPlace(scope, at, {
    top: 120,
    left: 8,
    sideways: 4,
    anchor: { shows: ['a.txt', '3'], fraction: 0.5 },
    toggled: new Map([['a.txt', false]]),
    current: 2,
  });
  state().pickLanguage(languageKey, 'python');
}

suite('Git store, keeping each tab with the main process', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('sends what a worktree keeps once it settles, at once once the worktree is left, and only once it changed', () => {
    const { posted, store } = posting();
    store.getState().receive(shown());
    store.getState().toggleCommits();
    vi.advanceTimersByTime(250);
    assert.deepStrictEqual(keptSent(posted), []);
    vi.advanceTimersByTime(100);
    assert.deepStrictEqual(keptSent(posted), [
      { type: 'keepTab', root: '/repo', kept: { commitsHidden: true } },
    ]);
    store.getState().search(true);
    store.getState().receive(showing('/other'));
    assert.deepStrictEqual(keptSent(posted).slice(1), [
      {
        type: 'keepTab',
        root: '/repo',
        kept: { commitsHidden: true, searching: true },
      },
    ]);
    vi.advanceTimersByTime(1000);
    assert.strictEqual(keptSent(posted).length, 2);
  });

  test('sends what every tab keeps at once once asked, as the page goes away', () => {
    const { posted, store } = posting();
    store.getState().receive(shown());
    store.getState().activateColumn('files');
    store.getState().flushKept();
    assert.deepStrictEqual(keptSent(posted), [
      { type: 'keepTab', root: '/repo', kept: { column: 'files' } },
    ]);
  });

  test('brings a worktree back from what the main process kept of it as it was left in another page, replacing what this page held of it, and tells the main process at once that this page holds it now', () => {
    const left = posting();
    leftAsWorked(left.store);
    const asLeft = looks(left.store);
    left.store.getState().receive(showing('/other'));
    const [sent] = keptSent(left.posted);
    assert.ok(sent?.type === 'keepTab');
    const back = posting();
    back.store.getState().receive(shown());
    back.store.getState().activateColumn('files');
    back.store.getState().receive(showing(undefined));
    const before = keptSent(back.posted).length;
    back.store.getState().receive({
      type: 'keptTab',
      root: '/repo',
      kept: JSON.stringify(sent.kept),
    });
    assert.deepStrictEqual(keptSent(back.posted).slice(before), [sent]);
    back.store.getState().receive(shown());
    back.store.getState().receive(filesOf(at));
    assert.deepStrictEqual(looks(back.store), asLeft);
  });

  test('brings a compare tab back from what the main process kept of it, its find, focus, place and language', () => {
    const left = posting();
    const compared = tabScopeOf('7', undefined);
    const selection = '/a.txt\n/b.txt';
    const state = () => left.store.getState();
    state().receive({ type: 'compare', compare: compare('7') });
    state().keepDiffFind(compared, {
      finding: true,
      search: { query: 'eve', options: plainSearch },
    });
    state().keepFocus(compared, { name: 'diff' });
    state().keepDiffPlace(compared, selection, { top: 30, current: 1 });
    state().pickLanguage(compareLanguageKey('7'), 'rust');
    state().receive({ type: 'compare', compare: undefined });
    const [sent] = keptSent(left.posted);
    assert.ok(sent?.type === 'keepCompare');
    assert.strictEqual(sent.tab, '7');
    const back = posting().store;
    back.getState().receive({
      type: 'keptCompare',
      tab: '7',
      kept: JSON.stringify(sent.kept),
    });
    const compareLooks = (store: StoreApi<GitState>) => [
      diffFindOf(compared)(store.getState()),
      store.getState().keptFocusOf(compared),
      store.getState().diffPlaceOf(compared, selection),
      pickedFor(compareLanguageKey('7'))(store.getState()),
    ];
    assert.deepStrictEqual(compareLooks(back), compareLooks(left.store));
  });

  test('lets go of what it keeps of the worktrees and compare tabs the main process names, sending what it held of them first, and sends nothing more of them until it shows them again', () => {
    const { posted, store } = posting();
    const state = () => store.getState();
    const compared = tabScopeOf('7', undefined);
    state().receive(shown());
    state().receive(filesOf(at));
    state().toggleCommits();
    state().keepFocus(scope, { name: 'files' });
    state().keepFilesScroll(view, 80);
    state().keepDiffFind(compared, {
      finding: true,
      search: { query: 'eve', options: plainSearch },
    });
    state().receive({ type: 'forgetTabs', roots: ['/repo'], compares: ['7'] });
    assert.deepStrictEqual(keptSent(posted), [
      {
        type: 'keepTab',
        root: '/repo',
        kept: {
          commitsHidden: true,
          filesScrolls: [[view, 80]],
          focus: { name: 'files' },
        },
      },
      {
        type: 'keepCompare',
        tab: '7',
        kept: {
          find: {
            finding: true,
            search: { query: 'eve', options: plainSearch },
          },
        },
      },
    ]);
    assert.deepStrictEqual(
      [
        commitsShownOf(state()),
        state().keptFocusOf(scope),
        state().filesScrollOf(view),
        diffFindOf(compared)(state()).finding,
      ],
      [true, undefined, undefined, false],
    );
    state().activateColumn('diff');
    vi.advanceTimersByTime(1000);
    assert.strictEqual(keptSent(posted).length, 2);
    state().receive(showing('/other'));
    state().receive(shown());
    state().activateColumn('files');
    vi.advanceTimersByTime(1000);
    assert.deepStrictEqual(keptSent(posted).slice(2), [
      { type: 'keepTab', root: '/repo', kept: { column: 'files' } },
    ]);
  });

  test('takes of what the main process kept only what is well formed, field by field, as it comes from a page', () => {
    const { store } = posting();
    store.getState().receive({
      type: 'keptTab',
      root: '/repo',
      kept: JSON.stringify({
        commitsHidden: 'yes',
        searching: true,
        column: 'nowhere',
        search: { query: 7, options: plainSearch },
        filter: { query: 'src', options: plainSearch },
        folders: { view, open: ['a', 3], closed: [] },
        locationsScroll: Number.NaN,
        filesScrolls: [
          [view, 'far'],
          [view, 80],
        ],
        places: [
          [at, { top: 'far' }],
          [
            at,
            {
              top: 5,
              sideways: 0,
              left: 0,
              toggled: [['a.txt', true]],
              current: 1,
            },
          ],
        ],
        focus: { name: 'diff', selection: [1, 'x', 'forward'] },
      }),
    });
    store
      .getState()
      .receive({ type: 'keptTab', root: '/other', kept: 'nothing' });
    store.getState().receive(shown());
    store.getState().receive(filesOf(at));
    const state = store.getState();
    assert.deepStrictEqual(
      {
        commitsShown: commitsShownOf(state),
        searching: searchingOf(state),
        column: activeColumnOf(state),
        search: searchOf(state).query,
        filter: fileFilterOf(state)?.query,
        folders: shownFoldersOf(state).open,
        locationsScroll: state.locationsScrollOf(),
        filesScroll: state.filesScrollOf(view),
        place: state.diffPlaceOf(scope, at),
        focus: state.keptFocusOf(scope),
      },
      {
        commitsShown: true,
        searching: true,
        column: 'commits',
        search: '',
        filter: 'src',
        folders: new Set(),
        locationsScroll: undefined,
        filesScroll: 80,
        place: {
          top: 5,
          anchor: undefined,
          sideways: 0,
          left: 0,
          toggled: new Map([['a.txt', true]]),
          current: 1,
        },
        focus: { name: 'diff' },
      },
    );
  });

  test('keeps at most the last thousand folders and locations toggled of a worktree, so what it keeps stays small', () => {
    const left = posting();
    const state = () => left.store.getState();
    state().receive(shown());
    state().receive(filesOf(at));
    for (let index = 0; index < 1500; index++) {
      state().toggleFolder('closed', `folder ${index}`);
    }
    state().keepLocations({
      highlight: undefined,
      toggled: new Set(
        Array.from({ length: 1500 }, (_, index) => `branch:${index}`),
      ),
    });
    state().flushKept();
    const sent = keptSent(left.posted).at(-1);
    assert.ok(sent?.type === 'keepTab');
    const back = posting().store;
    back.getState().receive(shown());
    back.getState().receive({
      type: 'keptTab',
      root: '/repo',
      kept: JSON.stringify(sent.kept),
    });
    back.getState().receive(filesOf(at));

    const folders = shownFoldersOf(back.getState());
    assert.strictEqual(folders.open.size + folders.closed.size, 1000);
    const toggled = locationsOf(back.getState())?.toggled;
    assert.strictEqual(toggled?.size, 1000);
    assert.ok(toggled.has('branch:1499') && !toggled.has('branch:0'));
  });
});
