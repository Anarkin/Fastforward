import * as assert from 'node:assert';
import { afterEach, beforeEach, suite, test, vi } from 'vitest';
import type { StoreApi } from 'zustand';
import { plainSearch } from '../../../../../lib/shared/searchOptions';
import type { GitState } from '../../../../../tools/git/page/state';
import {
  activeColumnOf,
  commitFilterOf,
  commitsShownOf,
  fileCursorOf,
  fileFilterOf,
  fileFoldsOf,
  folderViewOf,
  languageKeyOf,
  shownFoldersOf,
  tabScopeOf,
} from '../../../../../tools/git/page/selectors';
import {
  diffFindOf,
  pickedFor,
} from '../../../../../components/diff/page/slice';
import { emptyTabView } from '../../../../../tools/git/page/shownTab';
import {
  maxViewChars,
  type ToHost,
} from '../../../../../shell/shared/protocol';
import { at, posting, shown } from './storeFixtures';

const elsewhere = {
  type: 'worktrees',
  worktree: undefined,
  worktrees: [],
} as const;

const filesOf = (hash: string) => ({
  type: 'files' as const,
  hash,
  files: [],
});

const keptSent = (posted: readonly ToHost[]) =>
  posted.flatMap((message) =>
    message.type === 'keepView'
      ? [{ tab: message.tab, view: JSON.parse(message.view) as unknown }]
      : [],
  );

const viewOf = (posted: readonly ToHost[], tab = '1') =>
  posted.findLast(
    (message): message is Extract<ToHost, { type: 'keepView' }> =>
      message.type === 'keepView' && message.tab === tab,
  )?.view;

const worktreesOf = (...worktrees: (readonly [string, unknown])[]) => ({
  worktrees,
});

const scope = tabScopeOf('/repo');

const view = folderViewOf({ ...emptyTabView, root: '/repo', hash: at });

const languageKey = languageKeyOf({
  ...emptyTabView,
  root: '/repo',
  hash: at,
  path: 'a.txt',
});

const looks = (store: StoreApi<GitState>) => {
  const state = store.getState();
  return {
    commitsShown: commitsShownOf(state),
    column: activeColumnOf(state),
    commitFilter: commitFilterOf(state),
    filter: fileFilterOf(state),
    folders: shownFoldersOf(state),
    folds: fileFoldsOf(state),
    cursor: fileCursorOf(state),
    pin: state.pinnedMessages.get('/repo'),
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
  state().filterCommits('adam', { ...plainSearch, wholeWord: true });
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
  state().keepFilesScroll(view, 80);
  state().keepDiffFind(scope, {
    finding: true,
    search: { query: 'eve', options: { ...plainSearch, regex: true } },
  });
  state().keepFocus(scope, { name: 'diff-find', selection: [1, 2, 'forward'] });
  state().keepDiffPlace(scope, at, {
    top: 120,
    sideways: 4,
    anchor: { shows: ['a.txt', '3'], fraction: 0.5 },
    toggled: new Map([['a.txt', false]]),
    current: 2,
  });
  state().pickLanguage(languageKey, 'python');
}

suite('Git store, keeping the view of each tab', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('sends the view of a tab, holding its worktrees, once it settles, at once once the tab is left, and only once it changed', () => {
    const { shell, store } = posting();
    store.getState().receive(shown());
    store.getState().toggleCommits();
    vi.advanceTimersByTime(250);
    assert.deepStrictEqual(keptSent(shell), []);
    vi.advanceTimersByTime(100);
    assert.deepStrictEqual(keptSent(shell), [
      { tab: '1', view: worktreesOf(['/repo', { commitsHidden: true }]) },
    ]);
    store.getState().filterCommits('fix');
    store.getState().receive(shown([], '/other', '2'));
    assert.deepStrictEqual(keptSent(shell).slice(1), [
      {
        tab: '1',
        view: worktreesOf([
          '/repo',
          {
            commitsHidden: true,
            commitFilter: { query: 'fix', options: plainSearch },
          },
        ]),
      },
    ]);
    vi.advanceTimersByTime(1000);
    assert.strictEqual(keptSent(shell).length, 2);
  });

  test('marks the view of a tab changed by every change of what it keeps, a scroll or a focus alone too, so a tab moved comes back as it was left', () => {
    const { shell, store } = posting();
    const state = () => store.getState();
    state().receive(shown());
    state().receive(filesOf(at));
    const changes = [
      () => state().keepFilesScroll(view, 80),
      () => state().keepFocus(scope, { name: 'files' }),
      () => state().keepDiffPlace(scope, at, { top: 120 }),
    ];
    for (const change of changes) {
      change();
      vi.advanceTimersByTime(300);
    }
    const scrolled = { filesScrolls: [[view, 80]] };
    const focused = { ...scrolled, focus: { name: 'files' } };
    const placed = {
      ...focused,
      places: [[at, { top: 120, sideways: 0, toggled: [], current: 0 }]],
    };
    assert.deepStrictEqual(
      keptSent(shell).map((sent) => sent.view),
      [scrolled, focused, placed].map((kept) => worktreesOf(['/repo', kept])),
    );
  });

  test('sends the view of every tab at once once asked, as the page goes away', () => {
    const { shell, store } = posting();
    store.getState().receive(shown());
    store.getState().activateColumn('files');
    store.getState().flushKept();
    assert.deepStrictEqual(keptSent(shell), [
      { tab: '1', view: worktreesOf(['/repo', { column: 'files' }]) },
    ]);
  });

  test('brings a tab back from the view handed to the page as it was left in another page, each of its worktrees, replacing what this page held of them', () => {
    const left = posting();
    left.store.getState().receive(shown([], '/repo-wt'));
    left.store.getState().activateColumn('diff');
    leftAsWorked(left.store);
    const asLeft = looks(left.store);
    left.store.getState().receive(elsewhere);
    const sent = viewOf(left.shell);
    assert.ok(sent !== undefined);
    const back = posting();
    back.store.getState().receive(shown());
    back.store.getState().activateColumn('files');
    back.store.getState().receive(elsewhere);
    back.views.handed('1', sent);
    back.store.getState().receive(shown());
    back.store.getState().receive(filesOf(at));
    assert.deepStrictEqual(looks(back.store), asLeft);
    back.store.getState().receive(shown([], '/repo-wt'));
    assert.strictEqual(activeColumnOf(back.store.getState()), 'diff');
  });

  test('lets go of a tab released, giving its view as it is at once, the changes not sent yet too, and sends nothing more of it until it shows it again', () => {
    const { shell, store, views } = posting();
    const state = () => store.getState();
    state().receive(shown());
    state().receive(filesOf(at));
    state().toggleCommits();
    state().keepFocus(scope, { name: 'files' });
    state().keepFilesScroll(view, 80);
    const before = keptSent(shell).length;

    for (const tab of ['1', '7', '9']) {
      views.release(tab);
    }
    const released = shell.flatMap((message) =>
      message.type === 'released' ? [message.view] : [],
    );
    assert.deepStrictEqual(
      released.map((each) =>
        each === '' ? each : (JSON.parse(each) as unknown),
      ),
      [
        worktreesOf([
          '/repo',
          {
            commitsHidden: true,
            filesScrolls: [[view, 80]],
            focus: { name: 'files' },
          },
        ]),
        '',
        '',
      ],
    );
    assert.deepStrictEqual(
      [
        commitsShownOf(state()),
        state().keptFocusOf(scope),
        state().filesScrollOf(view),
      ],
      [true, undefined, undefined],
    );
    state().activateColumn('diff');
    vi.advanceTimersByTime(1000);
    assert.strictEqual(keptSent(shell).length, before);
    state().receive(elsewhere);
    state().receive(shown());
    state().activateColumn('files');
    vi.advanceTimersByTime(1000);
    assert.deepStrictEqual(keptSent(shell).slice(before), [
      { tab: '1', view: worktreesOf(['/repo', { column: 'files' }]) },
    ]);
  });

  test('keeps in the view of a tab the twenty worktrees it showed last', () => {
    const { shell, store } = posting();
    for (let index = 0; index < 25; index++) {
      store.getState().receive(shown([], `/w${index}`));
    }
    store.getState().receive(shown([], '/w3'));
    store.getState().toggleCommits();
    store.getState().flushKept();
    const sent = viewOf(shell);
    assert.ok(sent !== undefined);
    const parsed: unknown = JSON.parse(sent);
    assert.ok(
      typeof parsed === 'object' &&
        parsed !== null &&
        'worktrees' in parsed &&
        Array.isArray(parsed.worktrees),
    );
    assert.deepStrictEqual(
      parsed.worktrees.map((entry: unknown) =>
        Array.isArray(entry) ? (entry[0] as unknown) : entry,
      ),
      [...Array.from({ length: 19 }, (_, index) => `/w${index + 6}`), '/w3'],
    );
  });

  test('takes of a view handed only what is well formed, field by field, as it comes from a page', () => {
    const { store, views } = posting();
    views.handed(
      '1',
      JSON.stringify(
        worktreesOf(
          ['/other', 'nothing'],
          [
            '/repo',
            {
              commitsHidden: 'yes',
              column: 'nowhere',
              commitFilter: { query: 7, options: plainSearch },
              filter: { query: 'src', options: plainSearch },
              folders: { view, open: ['a', 3], closed: [] },
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
                    toggled: [['a.txt', true]],
                    current: 1,
                  },
                ],
              ],
              focus: { name: 'diff', selection: [1, 'x', 'forward'] },
            },
          ],
        ),
      ),
    );
    store.getState().receive(shown());
    store.getState().receive(filesOf(at));
    const state = store.getState();
    assert.deepStrictEqual(
      {
        commitsShown: commitsShownOf(state),
        column: activeColumnOf(state),
        commitFilter: commitFilterOf(state),
        filter: fileFilterOf(state)?.query,
        folders: shownFoldersOf(state).open,
        filesScroll: state.filesScrollOf(view),
        place: state.diffPlaceOf(scope, at),
        focus: state.keptFocusOf(scope),
      },
      {
        commitsShown: true,
        column: 'commits',
        commitFilter: undefined,
        filter: 'src',
        folders: new Set(),
        filesScroll: 80,
        place: {
          top: 5,
          anchor: undefined,
          sideways: 0,
          toggled: new Map([['a.txt', true]]),
          current: 1,
        },
        focus: { name: 'diff' },
      },
    );
  });

  test('keeps at most the last thousand folders toggled of a worktree, so what it keeps stays small', () => {
    const left = posting();
    const state = () => left.store.getState();
    state().receive(shown());
    state().receive(filesOf(at));
    for (let index = 0; index < 1500; index++) {
      state().toggleFolder('closed', `folder ${index}`);
    }
    state().flushKept();
    const sent = viewOf(left.shell);
    assert.ok(sent !== undefined);
    const back = posting();
    back.views.handed('1', sent);
    back.store.getState().receive(shown());
    back.store.getState().receive(filesOf(at));

    const folders = shownFoldersOf(back.store.getState());
    assert.strictEqual(folders.open.size + folders.closed.size, 1000);
  });

  test('leaves out the worktrees of a tab shown longest ago until its view fits the bound the shell keeps, and keeps the last folds of a diff, so a tab of many worktrees still comes back as it was left', () => {
    const { shell, store } = posting();
    const state = () => store.getState();
    const long = 'a folder with a long name '.repeat(5);
    for (let worktree = 0; worktree < 12; worktree++) {
      state().receive(shown([], `/w${worktree}`));
      state().receive(filesOf(at));
      for (let index = 0; index < 1000; index++) {
        state().toggleFolder('closed', `${long}${index}`);
      }
    }
    state().keepDiffPlace(tabScopeOf('/w11'), at, {
      toggled: new Map(
        Array.from({ length: 3000 }, (_, index) => [`${long}${index}`, true]),
      ),
    });
    state().toggleCommits();
    state().flushKept();
    const sent = viewOf(shell);
    assert.ok(sent !== undefined);
    assert.ok(sent.length <= maxViewChars, `${sent.length} characters`);
    const parsed: unknown = JSON.parse(sent);
    assert.ok(
      typeof parsed === 'object' &&
        parsed !== null &&
        'worktrees' in parsed &&
        Array.isArray(parsed.worktrees),
    );
    const roots = parsed.worktrees.map((entry: unknown) =>
      Array.isArray(entry) ? (entry[0] as unknown) : entry,
    );
    assert.ok(roots.length > 1 && roots.length < 12);
    assert.strictEqual(roots.at(-1), '/w11');
    assert.ok(!sent.includes(`${long}1999`) && sent.includes(`${long}2999`));
  });
});
