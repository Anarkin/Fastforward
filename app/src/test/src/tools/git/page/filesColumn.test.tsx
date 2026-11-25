import * as assert from 'node:assert';
import { ChangesTreeItem } from '../../../../../tools/git/page/changesTree';
import { JSDOM } from 'jsdom';
import { act, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import {
  plainSearch,
  type Search,
  type SearchOptions,
} from '../../../../../lib/shared/searchOptions';
import {
  type ChangeArea,
  type FileChange,
  type GitToHost,
} from '../../../../../tools/git/shared/protocol';
import { CommitHistory } from '../../../../../tools/git/page/commitHistory';
import { Files } from '../../../../../tools/git/page/filesColumn';
import { createGitStore, GitStore } from '../../../../../tools/git/page/store';
import {
  fileFilterOf,
  folderViewOf,
  shownFoldersOf,
} from '../../../../../tools/git/page/selectors';
import {
  emptyTabView,
  type TabView,
} from '../../../../../tools/git/page/shownTab';
import type { VisibleRows } from '../../../../../lib/page/listMoves';
import type { Folders } from '../../../../../tools/git/page/viewFolders';
import { revealAgain, type ListedRows } from '../../../../../lib/page/listRows';
import { FileRow } from '../../../../../lib/page/tree';
import {
  clickRow,
  renderIn,
  type RowProps,
  renderedBy,
} from '../../../../helpers/componentFixtures';
import { noop } from '../../../../helpers/fixtures';
import { fileChange as change } from '../../../../helpers/gitValues';
import { keyPress } from '../../../../helpers/keys';
import { tagWith } from '../../../../helpers/markup';

const commit = '0123456789abcdef0123456789abcdef01234567';
const otherCommit = 'fedcba9876543210fedcba9876543210fedcba98';

interface Shown {
  readonly hash?: string | undefined;
  readonly showAll?: boolean;
  readonly files?: readonly FileChange[];
  readonly staged?: readonly FileChange[];
  readonly loading?: boolean;
  readonly tree?: readonly string[] | undefined;
  readonly closedFolders?: ReadonlySet<string>;
  readonly openedFolders?: ReadonlySet<string>;
  readonly selected?: string;
  readonly area?: ChangeArea;
  readonly filter?: string;
  readonly filterOptions?: SearchOptions;
}

type Store = ReturnType<typeof createGitStore>;

function filesState(shown: Shown) {
  const hash = 'hash' in shown ? shown.hash : commit;
  const tab: TabView = {
    ...emptyTabView,
    root: '/repo',
    history: new CommitHistory(0),
    hash,
    files: shown.files ?? [],
    staged: shown.staged,
    filesLoading: shown.loading ?? false,
    tree:
      hash === undefined || shown.tree === undefined
        ? undefined
        : { type: 'tree', hash, paths: shown.tree },
    path: shown.selected,
    area: shown.area,
  };
  return {
    tab,
    showAllFiles: shown.showAll ?? false,
    fileFilters: new Map<string, Search>(
      shown.filter === undefined
        ? []
        : [
            [
              '/repo',
              {
                query: shown.filter,
                options: shown.filterOptions ?? plainSearch,
              },
            ],
          ],
    ),
    folders: new Map([
      [
        '/repo',
        {
          view: folderViewOf(tab),
          open: shown.openedFolders ?? new Set<string>(),
          closed: shown.closedFolders ?? new Set<string>(),
        },
      ],
    ]),
  };
}

function filesStore(
  shown: Shown = {},
  post: (message: GitToHost) => void = noop,
): Store {
  return createGitStore(post, filesState(shown));
}

function filesOf(store: Store): React.ReactNode {
  return renderedBy(Files, {}, { git: store });
}

function foldersShown(store: Store): Folders {
  const { open, closed } = shownFoldersOf(store.getState());
  return { open, closed };
}

function picking(picked: (string | undefined)[]) {
  return (message: GitToHost) => {
    if (message.type === 'selectFile') {
      picked.push(message.path);
    }
  };
}

function listOf(column: React.ReactNode) {
  assert.ok(isValidElement<{ children: React.ReactNode[] }>(column));
  const list = column.props.children[1];
  assert.ok(
    isValidElement<{
      rows: ListedRows;
      renderRow: (index: number) => React.ReactElement<RowProps>;
      selectedKey: string | undefined;
      revealWith: readonly unknown[];
      onKeyDown: (
        event: ReturnType<typeof keyPress> & { preventDefault: () => void },
        visible: VisibleRows,
      ) => void;
    }>(list),
  );
  const { rows, renderRow, selectedKey, revealWith, onKeyDown } = list.props;
  return {
    keys: Array.from({ length: rows.count }, (_, index) => rows.keyOf(index)),
    rows: Array.from(
      { length: rows.count },
      (_, index): React.ReactElement<RowProps> => {
        const row = renderRow(index);
        if (row.type !== ChangesTreeItem) {
          return row;
        }
        assert.ok(
          isValidElement<React.ComponentProps<typeof ChangesTreeItem>>(row),
        );
        const inner = ChangesTreeItem(row.props);
        assert.ok(isValidElement<RowProps>(inner));
        return inner;
      },
    ),
    selectedKey,
    revealWith,
    press: (key: string) =>
      onKeyDown(
        { ...keyPress(key), preventDefault: noop },
        { first: 0, last: rows.count - 1 },
      ),
  };
}

function changesRows(shown: Shown, post?: (message: GitToHost) => void) {
  return listOf(filesOf(filesStore(shown, post)));
}

function startButton(column: React.ReactNode, title: string) {
  assert.ok(
    isValidElement<{
      start: React.ReactElement<{
        children: React.ReactElement<{
          'data-tip': string;
          disabled?: boolean;
          onClick: () => void;
        }>[];
      }>;
    }>(column),
  );
  const found = column.props.start.props.children.find(
    (each) => each.props['data-tip'] === title,
  );
  assert.ok(found, title);
  assert.ok(!found.props.disabled, title);
  return found;
}

async function drawing(
  check: (
    draw: (shown: Shown) => Promise<void>,
    drawn: () => React.ReactNode,
    store: Store,
  ) => Promise<void>,
): Promise<void> {
  const dom = new JSDOM('<!doctype html><main></main>');
  const globals = {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const saved = Object.fromEntries(
    Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
  );
  Object.assign(globalThis, globals);
  try {
    const { createRoot } = await import('react-dom/client');
    const main = dom.window.document.querySelector('main');
    assert.ok(main);
    const root = createRoot(main);
    const store = filesStore();
    let column: React.ReactNode;
    function Drawn() {
      column = Files();
      return null;
    }
    await check(
      (shown) =>
        act(async () => {
          store.setState(filesState(shown));
          renderIn(
            root,
            <GitStore value={store}>
              <Drawn />
            </GitStore>,
          );
        }),
      () => column,
      store,
    );
    await act(async () => {
      root.unmount();
    });
  } finally {
    Object.assign(globalThis, saved);
  }
}

function reveal(tree: string[] | undefined, showAll = true, hash = commit) {
  return {
    key: 'file:b.ts',
    rows: changesRows({
      hash,
      showAll,
      files: [change('b.ts')],
      tree,
      selected: 'b.ts',
    }).revealWith,
  };
}

function noChangesShown(
  files: ReturnType<typeof change>[],
  loading: boolean,
  showAll = false,
): string {
  const column = filesOf(
    filesStore({ showAll, files, loading, tree: ['kept.ts'] }),
  );
  assert.ok(isValidElement<{ children: React.ReactNode[] }>(column));
  return renderToStaticMarkup(<>{column.props.children[2]}</>);
}

function statusShown(shown: Shown): string | null | undefined {
  const column = filesOf(filesStore(shown));
  assert.ok(isValidElement<{ status: React.ReactNode }>(column));
  return new JSDOM(
    renderToStaticMarkup(<>{column.props.status}</>),
  ).window.document.querySelector('.column-status')?.textContent;
}

suite('Files column', () => {
  test('counts under it the files changed, or those its filter keeps of them, and nothing while none changed or before they load', () => {
    const files = [change('src/a.ts'), change('src/b.ts'), change('c.md')];
    assert.strictEqual(statusShown({ files }), '3 files changed');
    assert.strictEqual(statusShown({ files, filter: 'src' }), '2 of 3 files');
    assert.strictEqual(statusShown({ files: [] }), undefined);
    assert.strictEqual(statusShown({ files, loading: true }), undefined);
  });

  test('titles itself Files, showing all files only while its toggle is on', () => {
    for (const showAll of [false, true]) {
      const store = filesStore({ hash: undefined, showAll });
      const column = filesOf(store);
      assert.ok(
        isValidElement<{ title: string; start: React.ReactElement }>(column),
      );
      assert.strictEqual(column.props.title, 'Files');
      const html = renderToStaticMarkup(column.props.start);
      const toggle = tagWith(
        html,
        'data-tip="Show All Files"',
        'nav-button',
        'toggle',
      );
      assert.strictEqual(toggle.includes('aria-pressed="true"'), showAll);
      assert.ok(
        isValidElement<{
          children: React.ReactElement<{ onClick: () => void }>[];
        }>(column.props.start),
      );
      column.props.start.props.children[0].props.onClick();
      assert.strictEqual(store.getState().showAllFiles, !showAll);
    }
  });

  test('shows that nothing changed only once loaded, while it lists no file', () => {
    assert.strictEqual(
      noChangesShown([], false),
      '<div class="row empty">No changes</div>',
    );
    assert.strictEqual(noChangesShown([], true), '');
    assert.strictEqual(noChangesShown([change('a.ts')], false), '');
    assert.strictEqual(noChangesShown([], false, true), '');
  });

  test('collapses every folder, or expands every folder shown, the unchanged ones too while all files show', () => {
    for (const showAll of [false, true]) {
      const store = filesStore({
        showAll,
        closedFolders: new Set(['src']),
        files: [change('src/app/a.ts'), change('src/b.ts')],
        tree: ['docs/guide/intro.md', 'src/app/a.ts', 'src/b.ts'],
        openedFolders: new Set(['docs']),
      });
      const column = filesOf(store);
      const replaced: Folders[] = [];
      startButton(column, 'Collapse All').props.onClick();
      replaced.push(foldersShown(store));
      startButton(column, 'Expand All').props.onClick();
      replaced.push(foldersShown(store));
      assert.deepStrictEqual(replaced, [
        { open: new Set(), closed: new Set(['src', 'src/app']) },
        {
          open: new Set(showAll ? ['docs/guide'] : []),
          closed: new Set(),
        },
      ]);
    }
  });

  test('shows no rows without changes, not even their header', () => {
    assert.deepStrictEqual(changesRows({}).rows, []);
  });

  test('scrolls All Changes into view when it is selected, as Home or Page Up may select it', () => {
    assert.strictEqual(
      changesRows({ files: [change('a.ts')] }).selectedKey,
      'changes',
    );
  });

  test('shows All Changes above the staged and unstaged changes of the working tree, which it shows in sections, with a file in both', () => {
    const picked: [string | undefined, string | undefined][] = [];
    const { keys, rows, selectedKey } = changesRows(
      {
        files: [change('a.ts')],
        staged: [change('a.ts'), change('b.ts')],
        area: 'unstaged',
      },
      (message) => {
        if (message.type === 'selectFile') {
          picked.push([message.path, message.area]);
        }
      },
    );
    assert.deepStrictEqual(keys, [
      'changes',
      'staged:changes',
      'staged:file:a.ts',
      'staged:file:b.ts',
      'unstaged:changes',
      'unstaged:file:a.ts',
    ]);
    assert.strictEqual(selectedKey, 'unstaged:changes');
    const header = (index: number) =>
      renderToStaticMarkup(rows[index])
        .replace(/<[^>]*>/g, ' ')
        .trim();
    assert.strictEqual(header(0), 'All Changes');
    assert.strictEqual(header(1), 'Staged');
    assert.strictEqual(header(4), 'Unstaged');
    rows[0].props.onClick();
    rows[1].props.onClick();
    clickRow(rows[5], FileRow);
    assert.deepStrictEqual(picked, [
      [undefined, undefined],
      [undefined, 'staged'],
      ['a.ts', 'unstaged'],
    ]);
  });

  test('marks All Changes of the working tree while no side is picked, keeping its header with nothing changed', () => {
    const { keys, selectedKey } = changesRows({ files: [], staged: [] });
    assert.deepStrictEqual(keys, [
      'changes',
      'staged:changes',
      'unstaged:changes',
    ]);
    assert.strictEqual(selectedKey, 'changes');
  });

  test('deselects the selected file on a click, and selects another', () => {
    const picked: (string | undefined)[] = [];
    const { keys, rows, selectedKey } = changesRows(
      { files: [change('a.ts'), change('b.ts')], selected: 'a.ts' },
      picking(picked),
    );
    assert.strictEqual(selectedKey, 'file:a.ts');
    assert.deepStrictEqual(keys, ['changes', 'file:a.ts', 'file:b.ts']);
    clickRow(rows[1], FileRow);
    clickRow(rows[2], FileRow);
    assert.deepStrictEqual(picked, [undefined, 'b.ts']);
  });

  test('selects all changes with their header, marked while no file is, leaving them be when they are', () => {
    const picked: (string | undefined)[] = [];
    const [header] = changesRows(
      { files: [change('a.ts')] },
      picking(picked),
    ).rows;
    assert.match(header.props.className, /\bselected\b/);
    assert.strictEqual(
      renderToStaticMarkup(header),
      `<div class="${header.props.className}"><span class="path">All Changes</span></div>`,
    );
    header.props.onClick();
    assert.strictEqual(picked.length, 0);
    const [unmarked] = changesRows(
      { files: [change('a.ts')], selected: 'a.ts' },
      picking(picked),
    ).rows;
    assert.doesNotMatch(unmarked.props.className, /\bselected\b/);
    unmarked.props.onClick();
    assert.deepStrictEqual(picked, [undefined]);
  });

  test('puts the cursor on the nearest folder shown of a selected file a closed folder hides, going on from there with the keys', () => {
    const picked: (string | undefined)[] = [];
    const shown = (closed: string[], area?: 'unstaged') =>
      changesRows(
        {
          files: [
            change('src/app/a.ts'),
            change('src/app/b.ts'),
            change('src/lib/c.ts'),
            change('z.ts'),
          ],
          ...(area ? { staged: [change('y.ts')], area } : {}),
          selected: 'src/app/a.ts',
          closedFolders: new Set(closed),
        },
        picking(picked),
      );
    assert.strictEqual(shown(['src/app']).selectedKey, 'folder:src/app');
    assert.strictEqual(
      shown(['unstaged:src'], 'unstaged').selectedKey,
      'unstaged:folder:src',
    );
    const collapsed = shown(['src', 'src/app', 'src/lib']);
    assert.deepStrictEqual(collapsed.keys, [
      'changes',
      'folder:src',
      'file:z.ts',
    ]);
    assert.strictEqual(collapsed.selectedKey, 'folder:src');
    assert.match(collapsed.rows[1].props.className, /\bselected\b/);
    collapsed.press('ArrowDown');
    assert.deepStrictEqual(picked, ['z.ts']);
  });

  test('scrolls to the cursor again once all files load or show for a commit or tab, but not as they are listed again, as untracked files come and go in the working tree', () => {
    const loaded = reveal(['a.ts', 'b.ts']);
    assert.ok(!revealAgain(loaded, reveal(['a.ts', 'b.ts'])));
    assert.ok(!revealAgain(loaded, reveal(['a.ts', 'b.ts', 'c.ts'])));
    assert.ok(revealAgain(reveal(undefined), loaded));
    assert.ok(revealAgain(reveal(['a.ts', 'b.ts'], false), loaded));
    assert.ok(revealAgain(loaded, reveal(['a.ts', 'b.ts'], false)));
    assert.ok(revealAgain(loaded, reveal(['a.ts', 'b.ts'], true, otherCommit)));
  });
});

suite('Files search', () => {
  const found = [
    change('src/deals/DealsView.tsx'),
    change('src/deals/api.ts'),
    change('src/leads/LeadsView.tsx'),
    change('README.md'),
  ];

  test('lists only the files whose path holds every word searched for, opening every folder holding one, the closed ones too', () => {
    assert.deepStrictEqual(
      changesRows({
        filter: 'view',
        closedFolders: new Set(['src/deals']),
        files: found,
      }).keys,
      [
        'changes',
        'folder:src',
        'folder:src/deals',
        'file:src/deals/DealsView.tsx',
        'folder:src/leads',
        'file:src/leads/LeadsView.tsx',
      ],
    );
    assert.strictEqual(
      changesRows({ filter: '  ', files: found }).keys.length,
      changesRows({ files: found }).keys.length,
    );
  });

  test('searches the unchanged files too while all files show, opening their folders', () => {
    assert.deepStrictEqual(
      changesRows({
        filter: 'kept',
        showAll: true,
        tree: ['lib/kept.ts', 'lib/other.ts', 'a.ts'],
        files: [change('a.ts')],
      }).keys,
      ['folder:lib', 'file:lib/kept.ts'],
    );
  });

  test('collapses and expands every folder the search shows while it is open, the unchanged ones too while all files show, leaving the folders of the commit as they were', async () => {
    for (const showAll of [false, true]) {
      await drawing(async (draw, drawn, store) => {
        await draw({
          filter: 'view',
          files: found,
          showAll,
          tree: ['lib/old/OldView.tsx', ...found.map(({ path }) => path)],
        });
        const folders = store.getState().folders;
        const opened = listOf(drawn()).keys;
        await act(async () => {
          startButton(drawn(), 'Collapse All').props.onClick();
        });
        assert.deepStrictEqual(
          listOf(drawn()).keys,
          showAll
            ? ['changes', 'folder:lib/old', 'folder:src']
            : ['changes', 'folder:src'],
        );
        await act(async () => {
          startButton(drawn(), 'Expand All').props.onClick();
        });
        assert.deepStrictEqual(listOf(drawn()).keys, opened);
        assert.strictEqual(store.getState().folders, folders);
      });
    }
  });

  test('keeps a folder closed while searching only on the commit and tab it was closed on, as the search stays open as they change', async () => {
    await drawing(async (draw, drawn) => {
      await draw({ filter: 'view', files: found });
      const opened = listOf(drawn()).keys;
      const [, folder] = listOf(drawn()).rows;
      assert.ok(isValidElement<{ onToggle: (path: string) => void }>(folder));
      await act(async () => {
        folder.props.onToggle('src');
      });
      assert.deepStrictEqual(listOf(drawn()).keys, ['changes', 'folder:src']);
      await draw({ filter: 'view', files: found, hash: otherCommit });
      assert.deepStrictEqual(listOf(drawn()).keys, opened);
    });
  });

  test('says that no file matches the search, rather than showing nothing', () => {
    const column = filesOf(filesStore({ filter: 'zzz', files: found }));
    assert.ok(isValidElement<{ children: React.ReactNode[] }>(column));
    assert.strictEqual(
      renderToStaticMarkup(<>{column.props.children[2]}</>),
      '<div class="row empty">No files match</div>',
    );
  });

  test('has no button of its own for the search, Ctrl+F opening it, floating it above the files rather than over them, taking the keyboard only when asked so a tab switched back to keeps it where it was', () => {
    const closed = filesOf(filesStore());
    assert.ok(
      isValidElement<{
        search: unknown;
        searching: unknown;
        searchOverTitle: boolean;
      }>(closed),
    );
    assert.strictEqual(closed.props.search, undefined);
    assert.ok(!closed.props.searching);
    assert.strictEqual(closed.props.searchOverTitle, true);
    const open = filesOf(filesStore({ filter: 'view' }));
    assert.ok(isValidElement<{ searching: React.ReactNode }>(open));
    const html = renderToStaticMarkup(<>{open.props.searching}</>);
    assert.match(html, /class="toolbar search-bar monospace"/);
    assert.doesNotMatch(html, /autofocus/i);
    assert.match(html, /<input[^>]*placeholder="Search…"[^>]*value="view"/);
  });

  test('counts the selected file of the files kept, steps among them around and around, and keeps its toggles with its query, the X closing it as Esc does', () => {
    const store = filesStore({
      filter: 'view',
      filterOptions: { ...plainSearch, caseSensitive: true },
      files: found,
      selected: 'src/leads/LeadsView.tsx',
    });
    const open = filesOf(store);
    assert.ok(
      isValidElement<{
        searching: React.ReactElement<{
          found: { current: number; matches: number };
          options: SearchOptions;
          onStep: (step: 1 | -1) => void;
          onOptions: (options: SearchOptions) => void;
          onClose: () => void;
        }>;
      }>(open),
    );
    const bar = open.props.searching;
    assert.deepStrictEqual(bar.props.found, { current: -1, matches: 0 });
    const viewedStore = filesStore({
      filter: 'View',
      files: found,
      selected: 'src/leads/LeadsView.tsx',
    });
    const viewed = filesOf(viewedStore);
    assert.ok(
      isValidElement<{
        searching: React.ReactElement<{
          found: { current: number; matches: number };
          onStep: (step: 1 | -1) => void;
        }>;
      }>(viewed),
    );
    assert.deepStrictEqual(viewed.props.searching.props.found, {
      current: 1,
      matches: 2,
    });
    assert.match(
      renderToStaticMarkup(<>{viewed.props.searching}</>),
      /<span class="search-count">2 of 2<\/span>/,
    );
    viewed.props.searching.props.onStep(1);
    assert.strictEqual(
      viewedStore.getState().tab.path,
      'src/deals/DealsView.tsx',
    );
    bar.props.onOptions({ ...plainSearch, wholeWord: true });
    assert.deepStrictEqual(fileFilterOf(store.getState()), {
      query: 'view',
      options: { ...plainSearch, wholeWord: true },
    });
    bar.props.onClose();
    assert.strictEqual(fileFilterOf(store.getState()), undefined);
  });
});
