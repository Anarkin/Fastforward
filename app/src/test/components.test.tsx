import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../webview/App';
import {
  changesTree,
  changesTreeElement,
  changesTreeRows,
  folderRowKey,
  type ChangesTreeRow,
} from '../webview/changesTree';
import {
  CheckedOutBranch,
  CommitBubble,
  HeadBubble,
  RefBubble,
} from '../webview/bubbles';
import {
  MenuItems,
  OpenContextMenu,
  openedSubmenu,
  type ContextMenuItem,
  type MenuTarget,
} from '../webview/contextMenu';
import { leafIndent, LocationsPopup } from '../webview/locations';
import {
  AddressBar,
  historyButtonClick,
  historyLabel,
  HistoryMenu,
  locationsPopupKey,
  nextHistoryOpen,
  NavButtons,
} from '../webview/navBar';
import { changeClass, changeTitle } from '../webview/fileStatus';
import { DiffOptions } from '../webview/diffColumn';
import { FileHeader, HunkDivider, rowHeight } from '../webview/diffView';
import {
  Files,
  filesCursor,
  filesTitle,
  noChangesText,
} from '../webview/filesColumn';
import { comparisonOf } from '../shared/comparisons';
import { Highlight } from '../webview/highlight';
import type { Folders } from '../webview/viewFolders';
import { SkeletonRows } from '../webview/skeleton';
import { preloadDelay, resting, TabBar } from '../webview/tabBar';
import { WorktreeBar } from '../webview/worktreeBar';
import { GraphCell, graphWidth, rowLanes } from '../webview/graph';
import { FileRow, fileRowKey } from '../webview/tree';
import { VirtualRows, type ListedRows } from '../webview/virtualRows';
import {
  workingTreeHash,
  type FileChange,
  type GraphRow,
  type RefInfo,
  type RepositoryState,
} from '../shared/protocol';
import {
  classesOf,
  commitInfo,
  fileChange as change,
  renderedBy,
  tagsWith,
} from './fixtures';

const noop = () => {};

const changesTreeElements = ({
  rows,
  ...options
}: { rows: readonly ChangesTreeRow[] } & Parameters<
  typeof changesTreeElement
>[1]) => rows.map((row) => changesTreeElement(row, options));

function tagWith(html: string, text: string, ...classes: string[]): string {
  const found = tagsWith(html, ...classes).filter((tag) => tag.includes(text));
  assert.strictEqual(found.length, 1, `${classes.join(' ')} with ${text}`);
  return found[0];
}

suite('File status', () => {
  test('names the status and both paths of a rename in the tooltip', () => {
    assert.strictEqual(
      changeTitle(change('new.ts', { status: 'R', oldPath: 'old.ts' })),
      'Renamed: old.ts → new.ts',
    );
    assert.strictEqual(
      changeTitle(change('gone.ts', { status: 'D' })),
      'Deleted: gone.ts',
    );
    assert.strictEqual(changeClass(change('a.ts')), 'path');
    assert.strictEqual(
      changeClass(change('a.ts', { status: 'D' })),
      'path deleted',
    );
    assert.strictEqual(changeClass(undefined), 'path unchanged');
  });
});

interface RowProps {
  className: string;
  onClick: () => void;
}

type FilesProps = Parameters<typeof Files>[0];

function filesProps(overrides: Partial<FilesProps> = {}): FilesProps {
  return {
    showAll: false,
    onShowAll: noop,
    closedFolders: new Set(),
    onToggleClosedFolder: noop,
    files: [],
    loading: false,
    tree: undefined,
    openedFolders: new Set(),
    onToggleOpenFolder: noop,
    onReplaceFolders: noop,
    view: 'one',
    selected: undefined,
    onSelect: noop,
    ...overrides,
  };
}

function changesRows(
  files: ReturnType<typeof change>[],
  selected: string | undefined,
  onSelect: (path: string | undefined) => void,
) {
  const column = renderedBy(Files, filesProps({ files, selected, onSelect }));
  assert.ok(isValidElement<{ children: React.ReactNode[] }>(column));
  const list = column.props.children[1];
  assert.ok(
    isValidElement<{
      rows: ListedRows;
      renderRow: (index: number) => React.ReactElement<RowProps>;
      selectedKey: string | undefined;
    }>(list),
  );
  const { rows, renderRow, selectedKey } = list.props;
  return {
    keys: Array.from({ length: rows.count }, (_, index) => rows.keyOf(index)),
    rows: Array.from({ length: rows.count }, (_, index) => renderRow(index)),
    selectedKey,
  };
}

function noChangesShown(
  files: ReturnType<typeof change>[],
  loading: boolean,
  showAll = false,
): string {
  const column = renderedBy(
    Files,
    filesProps({
      noChanges: 'No changes',
      showAll,
      files,
      loading,
      tree: ['kept.ts'],
    }),
  );
  assert.ok(isValidElement<{ children: React.ReactNode[] }>(column));
  return renderToStaticMarkup(<>{column.props.children[2]}</>);
}

function clickFile(row: React.ReactElement) {
  assert.strictEqual(row.type, FileRow);
  assert.ok(isValidElement<Parameters<typeof FileRow>[0]>(row));
  const drawn = FileRow(row.props);
  assert.ok(isValidElement<RowProps>(drawn));
  drawn.props.onClick();
}

type DiffOptionsProps = Parameters<typeof DiffOptions>[0];

function diffOptionsProps(
  overrides: Partial<DiffOptionsProps> = {},
): DiffOptionsProps {
  return {
    entire: false,
    pinned: false,
    canShow: true,
    ignoreWhitespace: false,
    wordWrap: false,
    onEntire: noop,
    onPin: noop,
    onIgnoreWhitespace: noop,
    onWordWrap: noop,
    layout: 'inline',
    onLayout: noop,
    ...overrides,
  };
}

type OptionElement = React.ReactElement<{
  title?: string;
  'aria-pressed'?: boolean;
  onClick?: () => void;
  children?: OptionElement[];
}>;

function diffOptionButtons(overrides: Partial<DiffOptionsProps> = {}) {
  const element = DiffOptions(diffOptionsProps(overrides));
  assert.ok(isValidElement<{ children: OptionElement[] }>(element));
  return element.props.children.flatMap((child) =>
    child.type === 'button' ? [child] : (child.props.children ?? []),
  );
}

function diffOptionTitles(overrides: Partial<DiffOptionsProps>) {
  return diffOptionButtons(overrides).map((button) => button.props.title);
}

function entireFileButtons(
  entire: boolean,
  pinned: boolean,
  canShow = true,
  ignoreWhitespace = false,
  wordWrap = false,
) {
  const html = renderToStaticMarkup(
    <DiffOptions
      {...diffOptionsProps({
        entire,
        pinned,
        canShow,
        ignoreWhitespace,
        wordWrap,
      })}
    />,
  );
  return [...html.matchAll(/<button[^>]*>/g)]
    .slice(0, 4)
    .map(([button]) =>
      [
        button.includes('aria-pressed="true"') ? 'on' : 'off',
        button.includes('disabled') ? 'disabled' : 'enabled',
      ].join(' '),
    );
}

suite('Diff options', () => {
  test('shows the file entire for now, or pinned for every file', () => {
    assert.deepStrictEqual(entireFileButtons(false, false), [
      'off enabled',
      'off enabled',
      'off enabled',
      'off enabled',
    ]);
    assert.deepStrictEqual(entireFileButtons(true, false), [
      'on enabled',
      'off enabled',
      'off enabled',
      'off enabled',
    ]);
    assert.deepStrictEqual(entireFileButtons(false, true), [
      'on disabled',
      'on enabled',
      'off enabled',
      'off enabled',
    ]);
  });

  test('offers the entire file only with a file selected, but the pin always', () => {
    assert.deepStrictEqual(entireFileButtons(false, false, false), [
      'off disabled',
      'off enabled',
      'off enabled',
      'off enabled',
    ]);
  });

  test('ignores whitespace and wraps long lines on their own toggles, set apart from the others on both sides', () => {
    assert.deepStrictEqual(entireFileButtons(false, false, true, true), [
      'off enabled',
      'off enabled',
      'on enabled',
      'off enabled',
    ]);
    assert.deepStrictEqual(entireFileButtons(false, false, true, false, true), [
      'off enabled',
      'off enabled',
      'off enabled',
      'on enabled',
    ]);
    const html = renderToStaticMarkup(<DiffOptions {...diffOptionsProps()} />);
    assert.match(
      html,
      /<\/button><\/span><span class="nav-button-space"><\/span><button[^>]*title="Ignore Whitespace Changes"[^>]*>.*?<\/button><button[^>]*title="Wrap Long Lines"[^>]*>.*?<\/button><span class="nav-button-space"><\/span><div class="segmented"/,
    );
  });

  test('holds the pin together with the entire file button, filling both as one while pinned', () => {
    for (const pinned of [false, true]) {
      const html = renderToStaticMarkup(
        <DiffOptions {...diffOptionsProps({ pinned })} />,
      );
      assert.match(
        html,
        new RegExp(
          `^<div[^>]*><span class="pin-pair ${pinned ? 'pinned' : ''}"><button[^>]*title="${pinned ? 'Pinned to Show Entire Files' : 'Show the Entire File'}"[^>]*>.*?</button><button[^>]*title="${pinned ? 'Unpin' : 'Pin'} Entire Files"[^>]*>.*?</button></span>`,
        ),
      );
    }
  });

  test('names each toggle by what a click does, flipping as it switches', () => {
    assert.deepStrictEqual(diffOptionTitles({}).slice(0, 4), [
      'Show the Entire File',
      'Pin Entire Files',
      'Ignore Whitespace Changes',
      'Wrap Long Lines',
    ]);
    assert.deepStrictEqual(
      diffOptionTitles({
        entire: true,
        ignoreWhitespace: true,
        wordWrap: true,
      }).slice(0, 4),
      [
        'Show Only the Changes',
        'Pin Entire Files',
        'Show Whitespace Changes',
        'Unwrap Long Lines',
      ],
    );
    assert.deepStrictEqual(diffOptionTitles({ pinned: true }).slice(0, 2), [
      'Pinned to Show Entire Files',
      'Unpin Entire Files',
    ]);
  });

  test('holds the inline and side by side buttons together, as only one of them is on at a time', () => {
    const html = renderToStaticMarkup(<DiffOptions {...diffOptionsProps()} />);
    assert.match(
      html,
      /<div class="segmented" role="group" aria-label="Layout"><button[^>]*title="Inline"[^>]*>.*?<\/button><button[^>]*title="Side by Side"[^>]*>.*?<\/button><\/div><\/div>$/,
    );
  });

  test('wraps long lines on its toggle, and stops on it again', () => {
    for (const wordWrap of [false, true]) {
      const wrapped: boolean[] = [];
      const [button] = diffOptionButtons({
        wordWrap,
        onWordWrap: (wrap) => wrapped.push(wrap),
      }).filter((child) => child.props.title?.toLowerCase().includes('wrap'));
      assert.strictEqual(button.props['aria-pressed'], wordWrap);
      button.props.onClick?.();
      assert.deepStrictEqual(wrapped, [!wordWrap]);
    }
  });

  test('shows the diff inline or side by side, the chosen layout pressed, switching on the other', () => {
    for (const layout of ['inline', 'sideBySide'] as const) {
      const picked: string[] = [];
      const buttons = diffOptionButtons({
        layout,
        onLayout: (next) => picked.push(next),
      }).filter(
        (button) =>
          button.props.title === 'Inline' ||
          button.props.title === 'Side by Side',
      );
      assert.deepStrictEqual(
        buttons.map((button) => [
          button.props.title,
          button.props['aria-pressed'],
        ]),
        [
          ['Inline', layout === 'inline'],
          ['Side by Side', layout === 'sideBySide'],
        ],
      );
      for (const button of buttons) {
        button.props.onClick?.();
      }
      assert.deepStrictEqual(picked, ['inline', 'sideBySide']);
    }
  });
});

suite('Hunk divider', () => {
  test('marks the lines left out between hunks with dots', () => {
    assert.strictEqual(
      renderToStaticMarkup(<HunkDivider />),
      '<div class="hunk-divider"><span class="hunk-dots">⋯</span></div>',
    );
  });
});

suite('Diff file header', () => {
  test('labels a file shown entire as unchanged, naming no commit, as it may be in the uncommitted changes or a comparison', () => {
    const html = renderToStaticMarkup(
      <FileHeader path="a.ts" open whole onClick={() => {}} />,
    );
    assert.match(html, /<span class="unchanged">Unchanged<\/span>/);
    assert.doesNotMatch(html, /commit/);
    assert.doesNotMatch(
      renderToStaticMarkup(
        <FileHeader path="a.ts" open whole={false} onClick={() => {}} />,
      ),
      /unchanged/,
    );
  });
});

suite('Files column', () => {
  test('keeps the cursor where the keys moved it only on the commit and tab it moved on', () => {
    const keys = ['changes', 'folder:src', 'file:src/a.ts'];
    const moved = { key: 'folder:src', from: 'changes', view: 'one' };
    assert.strictEqual(
      filesCursor(moved, 'changes', 'one', keys),
      'folder:src',
    );
    assert.strictEqual(filesCursor(moved, 'changes', 'two', keys), 'changes');
    assert.strictEqual(
      filesCursor(moved, 'file:src/a.ts', 'one', keys),
      'file:src/a.ts',
    );
    assert.strictEqual(
      filesCursor(moved, 'changes', 'one', ['changes']),
      'changes',
    );
    assert.strictEqual(
      filesCursor(undefined, 'changes', 'one', keys),
      'changes',
    );
  });

  test('titles itself Files, showing all files only while its toggle is on', () => {
    for (const showAll of [false, true]) {
      const picked: boolean[] = [];
      const column = renderedBy(
        Files,
        filesProps({ showAll, onShowAll: (next) => picked.push(next) }),
      );
      assert.ok(
        isValidElement<{ title: string; start: React.ReactElement }>(column),
      );
      assert.strictEqual(column.props.title, 'Files');
      const html = renderToStaticMarkup(column.props.start);
      const toggle = tagWith(
        html,
        'title="Show All Files"',
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
      assert.deepStrictEqual(picked, [!showAll]);
    }
  });

  test('titles itself with the commits compared', () => {
    const hash = '0123456789abcdef0123456789abcdef01234567';
    assert.strictEqual(filesTitle(undefined), 'Files');
    assert.strictEqual(filesTitle(hash), 'Files');
    assert.strictEqual(
      filesTitle(comparisonOf(hash, workingTreeHash)),
      'Files: 0123456 → uncommitted',
    );
  });

  test('says a commit changed nothing, or that the two compared have the same files', () => {
    const hash = '0123456789abcdef0123456789abcdef01234567';
    assert.strictEqual(noChangesText(undefined), undefined);
    assert.strictEqual(noChangesText(hash), 'No changes');
    assert.strictEqual(
      noChangesText(comparisonOf(hash, workingTreeHash)),
      'No differences, both have the same files',
    );
  });

  test('shows that nothing changed only once loaded, while it lists no file', () => {
    assert.strictEqual(
      noChangesShown([], false),
      '<div class="empty-state">No changes</div>',
    );
    assert.strictEqual(noChangesShown([], true), '');
    assert.strictEqual(noChangesShown([change('a.ts')], false), '');
    assert.strictEqual(noChangesShown([], false, true), '');
  });

  test('collapses every folder, or expands every folder shown, the unchanged ones too while all files show', () => {
    for (const showAll of [false, true]) {
      const replaced: Folders[] = [];
      const column = renderedBy(
        Files,
        filesProps({
          showAll,
          closedFolders: new Set(['src']),
          files: [change('src/app/a.ts'), change('src/b.ts')],
          tree: ['docs/guide/intro.md', 'src/app/a.ts', 'src/b.ts'],
          openedFolders: new Set(['docs']),
          onReplaceFolders: (folders) => replaced.push(folders),
        }),
      );
      assert.ok(
        isValidElement<{
          start: React.ReactElement<{
            children: React.ReactElement<{
              title: string;
              disabled?: boolean;
              onClick: () => void;
            }>[];
          }>;
        }>(column),
      );
      const buttons = column.props.start.props.children;
      const button = (title: string) => {
        const found = buttons.find((each) => each.props.title === title);
        assert.ok(found, title);
        assert.ok(!found.props.disabled, title);
        return found;
      };
      button('Collapse All').props.onClick();
      button('Expand All').props.onClick();
      assert.deepStrictEqual(replaced, [
        { open: new Set(), closed: new Set(['src', 'src/app']) },
        {
          open: new Set(showAll ? ['docs/guide'] : []),
          closed: new Set(),
        },
      ]);
    }
  });

  test('draws only the rows in view of a long list, not every row', () => {
    const drawn: number[] = [];
    const keys = Array.from({ length: 10_000 }, (_, index) => `row:${index}`);
    renderToStaticMarkup(
      <VirtualRows
        rows={{
          count: keys.length,
          keyOf: (index) => keys[index],
          indexOf: (key) => keys.indexOf(key),
        }}
        renderRow={(index) => {
          drawn.push(index);
          return keys[index];
        }}
        selectedKey={undefined}
        initialRect={{ width: 400, height: 240 }}
      />,
    );
    const inView = Array.from({ length: 10 }, (_, index) => index);
    assert.deepStrictEqual(drawn.slice(0, inView.length), inView);
    assert.ok(drawn.length < 100, `${drawn.length} rows drawn`);
  });

  test('sizes the rows not drawn yet at the fixed height of a row, so the list is as long as it will be', () => {
    const html = renderToStaticMarkup(
      <VirtualRows
        rows={{
          count: 1000,
          keyOf: (index) => `row:${index}`,
          indexOf: () => -1,
        }}
        renderRow={() => null}
        selectedKey={undefined}
      />,
    );
    const height = 1000 * (rowHeight({ kind: 'hunk', file: 0 }) ?? 0);
    assert.match(
      html,
      new RegExp(`class="virtual-spacer" style="height:${height}px"`),
    );
  });

  test('shows no rows without changes, not even their header', () => {
    assert.deepStrictEqual(changesRows([], undefined, noop).rows, []);
  });

  test('scrolls All Changes into view when it is selected, as Home or Page Up may select it', () => {
    assert.strictEqual(
      changesRows([change('a.ts')], undefined, noop).selectedKey,
      'changes',
    );
  });

  test('deselects the selected file on a click, and selects another', () => {
    const picked: (string | undefined)[] = [];
    const { keys, rows, selectedKey } = changesRows(
      [change('a.ts'), change('b.ts')],
      'a.ts',
      (path) => picked.push(path),
    );
    assert.strictEqual(selectedKey, 'file:a.ts');
    assert.deepStrictEqual(keys, ['changes', 'file:a.ts', 'file:b.ts']);
    clickFile(rows[1]);
    clickFile(rows[2]);
    assert.deepStrictEqual(picked, [undefined, 'b.ts']);
  });

  test('selects all changes with their header, marked while no file is, leaving them be when they are', () => {
    const picked: (string | undefined)[] = [];
    const [header] = changesRows([change('a.ts')], undefined, (path) =>
      picked.push(path),
    ).rows;
    assert.match(header.props.className, /\bselected\b/);
    assert.strictEqual(
      renderToStaticMarkup(header),
      `<div class="${header.props.className}"><span class="path">All Changes</span></div>`,
    );
    header.props.onClick();
    assert.strictEqual(picked.length, 0);
    const [unmarked] = changesRows([change('a.ts')], 'a.ts', (path) =>
      picked.push(path),
    ).rows;
    assert.doesNotMatch(unmarked.props.className, /\bselected\b/);
    unmarked.props.onClick();
    assert.deepStrictEqual(picked, [undefined]);
  });
});

function changedRow(status: FileChange['status']): string {
  return renderToStaticMarkup(
    <FileRow
      path="a.ts"
      name="a.ts"
      depth={0}
      change={change('a.ts', { status })}
      selected={undefined}
      marked={false}
      onSelect={noop}
    />,
  );
}

suite('File rows', () => {
  test('shows a change plainly, marking only a deleted file', () => {
    for (const status of ['A', 'M', 'R', 'U'] as const) {
      assert.match(
        changedRow(status),
        /<span class="path">a\.ts<\/span>/,
        status,
      );
    }
    assert.match(changedRow('D'), /<span class="path deleted">a\.ts<\/span>/);
  });

  test('dims an unchanged file', () => {
    const html = renderToStaticMarkup(
      <FileRow
        path="src/a.ts"
        name="a.ts"
        depth={1}
        change={undefined}
        selected={undefined}
        marked={false}
        onSelect={noop}
      />,
    );
    tagWith(html, 'title="src/a.ts"', 'row', 'tree-row', 'file');
    tagWith(html, '', 'path', 'unchanged');
  });
});

suite('Highlight', () => {
  test('marks the search where it is, also after letters that lowercase longer', () => {
    assert.strictEqual(
      renderToStaticMarkup(<Highlight text="İstanbul main" query="main" />),
      'İstanbul <mark class="match">main</mark>',
    );
  });

  test('marks the search in a text, ignoring case and spaces around it', () => {
    assert.strictEqual(
      renderToStaticMarkup(<Highlight text="feature/Main" query=" main " />),
      'feature/<mark class="match">Main</mark>',
    );
  });
});

suite('Changes tree rows', () => {
  test('draws folders and files, marking the selected file', () => {
    const files = [change('src/a.ts'), change('src/b.ts')];
    const html = renderToStaticMarkup(
      <>
        {changesTreeElements({
          rows: changesTreeRows(changesTree(files), new Set()),
          showsAll: false,
          onToggle: noop,
          selected: 'src/b.ts',
          onSelect: noop,
          cursor: fileRowKey('src/b.ts'),
        })}
      </>,
    );
    tagWith(html, 'title="src"', 'row', 'tree-row', 'folder', 'dimmed');
    tagWith(html, 'title="Modified: src/b.ts"', 'row', 'file', 'selected');
    const a = tagWith(html, 'title="Modified: src/a.ts"', 'row', 'file');
    assert.ok(!classesOf(a).has('selected'));
  });

  test('marks the row under the cursor, still deselecting the selected file on a click', () => {
    const picked: (string | undefined)[] = [];
    const elements = changesTreeElements({
      rows: changesTreeRows(changesTree([change('src/a.ts')]), new Set()),
      showsAll: false,
      onToggle: noop,
      selected: 'src/a.ts',
      onSelect: (path) => picked.push(path),
      cursor: folderRowKey('src'),
    });
    const html = renderToStaticMarkup(<>{elements}</>);
    tagWith(html, 'title="src"', 'row', 'folder', 'selected');
    const a = tagWith(html, 'title="Modified: src/a.ts"', 'row', 'file');
    assert.ok(!classesOf(a).has('selected'));
    clickFile(elements[1]);
    assert.deepStrictEqual(picked, [undefined]);
  });

  test('showing all files, dims the folders and files without changes, and toggles each kind of folder its own way', () => {
    const toggled: string[] = [];
    const elements = changesTreeElements({
      rows: changesTreeRows(
        changesTree(
          [change('src/lib/a.ts')],
          ['src/lib/a.ts', 'src/b.ts', 'docs/c.md'],
        ),
        new Set(),
        new Set(['docs']),
      ),
      showsAll: true,
      onToggle: (folder, changed) => toggled.push(`${folder} ${changed}`),
      selected: undefined,
      onSelect: noop,
      cursor: undefined,
    });
    const html = renderToStaticMarkup(<>{elements}</>);
    for (const title of ['src', 'src/lib']) {
      const row = tagWith(html, `title="${title}"`, 'row', 'folder');
      assert.ok(!classesOf(row).has('dimmed'), title);
    }
    tagWith(html, 'title="docs"', 'row', 'folder', 'dimmed');
    assert.strictEqual(tagsWith(html, 'path', 'unchanged').length, 2);
    for (const element of elements) {
      if (
        isValidElement<{ onToggle?: (folder: string) => void; path: string }>(
          element,
        )
      ) {
        element.props.onToggle?.(element.props.path);
      }
    }
    assert.deepStrictEqual(toggled, ['docs false', 'src true', 'src/lib true']);
  });
});

const buttons = (props: Partial<Parameters<typeof NavButtons>[0]>) =>
  renderToStaticMarkup(
    <NavButtons
      back={[]}
      forward={[]}
      onNavigate={noop}
      fetching={false}
      onFetch={noop}
      autoFetch={false}
      autoFetchMinutes={1}
      onAutoFetch={noop}
      {...props}
    />,
  );

suite('Navigation bar', () => {
  test('greys out back and forward without steps', () => {
    const html = buttons({
      back: [{ hash: 'a'.repeat(40), subject: 'a' }],
    });
    assert.match(html, /title="Back[^"]*"(?![^>]*disabled)/);
    assert.match(html, /title="Forward[^"]*" disabled=""/);
  });

  test('says Search… in the search field, and what it searches in its tooltip', () => {
    const html = renderToStaticMarkup(
      <AddressBar
        root="/repo"
        bookmarks={[]}
        repository={undefined}
        hashLookup={undefined}
        onLookupHash={noop}
        commitSearch={undefined}
        onSearchCommits={noop}
        onJump={noop}
      />,
    );
    tagWith(
      html,
      'title="Search branches, remotes, tags and commits"',
      'address-bar',
    );
    assert.match(html, /class="address-text empty">Search…<\/span>/);
  });

  test('opens the search popup anew in another tab, so it searches again there for the same query', () => {
    assert.notEqual(locationsPopupKey(1, '/a'), locationsPopupKey(1, '/b'));
    assert.equal(locationsPopupKey(1, '/a'), locationsPopupKey(1, '/a'));
    assert.notEqual(locationsPopupKey(1, '/a'), locationsPopupKey(2, '/a'));
  });

  test('spins the fetch button while fetching', () => {
    const spinning = tagWith(
      buttons({ fetching: true }),
      'title="Fetch every remote',
      'nav-button',
      'running',
    );
    assert.match(spinning, /disabled=""/);
    const idle = tagWith(
      buttons({}),
      'title="Fetch every remote',
      'nav-button',
    );
    assert.ok(!classesOf(idle).has('running'));
  });

  test('pins fetching every few minutes next to the fetch button, hidden when the settings turn it off', () => {
    tagWith(buttons({}), 'title="Fetch Every Minute"');
    const on = tagWith(
      buttons({ autoFetch: true, autoFetchMinutes: 5 }),
      'title="Stop Fetching Every 5 Minutes"',
      'nav-button',
      'toggle',
      'active',
    );
    assert.match(on, /aria-pressed="true"/);
    assert.doesNotMatch(
      buttons({ autoFetch: true, autoFetchMinutes: 0 }),
      /Fetch(ing)? Every/,
    );
  });

  test('holds the pin together with the fetch button, filling both as one while pinned', () => {
    for (const autoFetch of [false, true]) {
      assert.match(
        buttons({ autoFetch }),
        new RegExp(
          `<span class="pin-pair ${autoFetch ? 'pinned' : ''}"><button[^>]*title="Fetch[^"]*"[^>]*>.*?</button><button[^>]*title="${autoFetch ? 'Stop Fetching' : 'Fetch'} Every Minute"[^>]*>.*?</button></span></div>$`,
        ),
      );
    }
  });
});

suite('Bubbles', () => {
  test('marks a commit bubble apart from the commit rows', () => {
    const html = renderToStaticMarkup(<CommitBubble hash={'a'.repeat(40)} />);
    const classes = classesOf(tagWith(html, '', 'badge'));
    assert.ok(classes.has('hash'));
    assert.ok(!classes.has('commit'));
  });

  test('marks only the branch checked out, and a ref gone missing', () => {
    const html = renderToStaticMarkup(
      <CheckedOutBranch.Provider value="main">
        <RefBubble info={{ kind: 'branch', name: 'main' }} />
        <RefBubble info={{ kind: 'tag', name: 'main' }} />
        <RefBubble info={{ kind: 'branch', name: 'gone' }} missing />
        <CommitBubble hash={'b'.repeat(40)} />
      </CheckedOutBranch.Provider>,
    );
    assert.match(
      tagWith(html, '', 'badge', 'branch', 'checked-out'),
      /title="main, checked out"/,
    );
    assert.ok(!classesOf(tagWith(html, '', 'badge', 'tag')).has('checked-out'));
    tagWith(
      html,
      'title="gone doesn&#x27;t exist anymore"',
      'badge',
      'missing',
    );
    assert.match(
      html,
      new RegExp(`title="Commit ${'b'.repeat(40)}">bbbbbbb</span>`),
    );
  });

  test('offers the menu of a detached HEAD commit', () => {
    const hash = 'c'.repeat(40);
    const targets: MenuTarget[] = [];
    let bubble: React.ReactElement<{ onContextMenu: () => void }> | undefined;
    const Capture = () => (bubble = HeadBubble({ hash }));
    renderToStaticMarkup(
      <OpenContextMenu.Provider value={(_, target) => targets.push(target)}>
        <Capture />
      </OpenContextMenu.Provider>,
    );
    assert.match(
      renderToStaticMarkup(bubble),
      new RegExp(`title="HEAD is detached at ${hash}">HEAD ccccccc<`),
    );
    bubble?.props.onContextMenu();
    assert.deepStrictEqual(targets, [
      { kind: 'ref', ref: { kind: 'commit', name: hash } },
    ]);
  });
});

suite('History buttons', () => {
  test('go a step on a click, but not on the one ending a hold', () => {
    assert.strictEqual(historyButtonClick(false, false), 'step');
    assert.strictEqual(historyButtonClick(true, true), 'none');
  });

  test('close their open history on a click instead of going a step', () => {
    assert.strictEqual(historyButtonClick(false, true), 'close');
  });

  test('close their history once it has no entries, so it stays closed when entries return', () => {
    let open = true;
    open = nextHistoryOpen(open, 0);
    assert.strictEqual(open, false);
    open = nextHistoryOpen(open, 2);
    assert.strictEqual(open, false);
    assert.strictEqual(nextHistoryOpen(true, 2), true);
  });

  test('go as many steps as the picked entry is from the current one', () => {
    const picked: number[] = [];
    const menu = renderedBy(HistoryMenu, {
      container: { current: null },
      entries: ['a', 'b', 'c'].map((hash) => ({
        hash: hash.repeat(40),
        subject: hash,
      })),
      onPick: (steps) => picked.push(steps),
      onClose: noop,
    });
    assert.ok(
      isValidElement<{
        children: React.ReactElement<{
          children: React.ReactElement<{ onClick: () => void }>;
        }>[];
      }>(menu),
    );
    menu.props.children[0].props.children.props.onClick();
    menu.props.children[2].props.children.props.onClick();
    assert.deepStrictEqual(picked, [1, 3]);
  });

  test('hold each entry the way other menus do, so the keys move between them alike', () => {
    const menu = renderToStaticMarkup(
      <HistoryMenu
        container={{ current: null }}
        entries={[{ hash: 'a'.repeat(40), subject: 'a' }]}
        onPick={noop}
        onClose={noop}
      />,
    );
    assert.match(
      menu,
      /^<div class="menu history-menu" role="menu"><div class="menu-entry"><button class="menu-item history-item"/,
    );
  });

  test('label an entry by its short hash, or a comparison by both', () => {
    const a = 'a'.repeat(40);
    const b = 'b'.repeat(40);
    assert.strictEqual(historyLabel(a), 'aaaaaaa');
    assert.strictEqual(historyLabel(comparisonOf(a, b)), 'aaaaaaa → bbbbbbb');
    const menu = renderToStaticMarkup(
      <HistoryMenu
        container={{ current: null }}
        entries={[{ hash: comparisonOf(a, b), subject: undefined }]}
        onPick={noop}
        onClose={noop}
      />,
    );
    assert.match(menu, /<span class="history-hash">aaaaaaa → bbbbbbb<\/span>/);
  });

  test('label the uncommitted changes as such, alone or compared', () => {
    const a = 'a'.repeat(40);
    assert.strictEqual(historyLabel(workingTreeHash), 'uncommitted');
    assert.strictEqual(
      historyLabel(comparisonOf(a, workingTreeHash)),
      'aaaaaaa → uncommitted',
    );
  });

  test('keys history entries apart that are the same commit', () => {
    const a = 'a'.repeat(40);
    const menu = renderedBy(HistoryMenu, {
      container: { current: null },
      entries: [
        { hash: a, subject: 'a' },
        { hash: 'b'.repeat(40), subject: 'b' },
        { hash: a, subject: 'a' },
      ],
      onPick: noop,
      onClose: noop,
    });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(menu));
    const keys = menu.props.children.map((entry) => entry.key);
    assert.strictEqual(new Set(keys).size, 3);
  });
});

const popup = (
  query: string,
  result?: Parameters<typeof LocationsPopup>[0]['lookup'],
  props: Partial<Parameters<typeof LocationsPopup>[0]> = {},
) =>
  renderToStaticMarkup(
    <LocationsPopup
      bookmarks={[]}
      repository={undefined}
      anchor={{ current: null }}
      lookup={result}
      onLookup={noop}
      commitSearch={undefined}
      onSearchCommits={noop}
      onJump={noop}
      onClose={noop}
      query={query}
      onQuery={noop}
      {...props}
    />,
  );

const found = (
  commits: string[],
  more = 0,
  query = 'abcd',
): Parameters<typeof LocationsPopup>[0]['lookup'] => ({
  type: 'hashLookup',
  query,
  result: {
    commits: commits.map((hash) =>
      commitInfo(hash, { subject: `subject ${hash.at(-1) ?? ''}` }),
    ),
    more,
  },
});

const searched = (
  query: string,
): Partial<Parameters<typeof LocationsPopup>[0]> => ({
  commitSearch: {
    type: 'commitSearch',
    query,
    result: { commits: [], capped: false },
  },
});

suite('Locations tree', () => {
  test('draws at most a few hundred refs side by side, counting the rest', () => {
    const refs = Array.from({ length: 300 }, (_, index): RefInfo => ({
      kind: 'tag',
      name: `v${String(index).padStart(3, '0')}`,
      commit: 'a',
    }));
    const html = popup('', undefined, {
      repository: { head: undefined, headCommit: undefined, refs },
    });
    assert.strictEqual(tagsWith(html, 'row', 'tree-row', 'leaf').length, 200);
    assert.match(html, /100 more; type to narrow them down/);
  });
});

suite('Commit results', () => {
  const first = 'abcd'.padEnd(40, '0');
  const second = 'abcd'.padEnd(40, '1');

  test('lists the commits a typed hash may be as commit rows, the first highlighted, with their bubbles', () => {
    const html = popup('ABCD', found([first, second], 3), {
      repository: {
        head: 'main',
        headCommit: second,
        refs: [{ kind: 'branch', name: 'main', commit: second }],
      },
    });
    assert.deepStrictEqual(counts(html), [5]);
    assert.match(html, /<header class="locations-heading">Commits/);
    assert.strictEqual(tagsWith(html, 'commit', 'selected').length, 1);
    assert.match(
      html,
      /<div class="commit selected" style="padding-left:8px">.*?subject 0/,
    );
    assert.match(html, /class="commit checked-out".*subject 1/);
    assert.match(html, /<span class="badge branch[^>]*>main<\/span>/);
    assert.match(html, /3 more; type more to narrow it down/);
  });

  test('says when no commit starts with it, or that it is still looking', () => {
    assert.match(
      popup('abcd', found([]), searched('abcd')),
      /No commit starts with abcd/,
    );
    assert.match(popup('abcd'), /Looking for commit abcd/);
  });

  test('waits for the lookup of what is typed now, not an earlier prefix', () => {
    const html = popup('abcde', found([first]));
    assert.match(html, /Looking for commit abcde/);
    assert.strictEqual(tagsWith(html, 'commit').length, 0);
  });

  test('lists the commits whose author, committer or message matches after those a typed hash may be, marking the match', () => {
    const byText = (query: string, capped = false) => ({
      commitSearch: {
        type: 'commitSearch' as const,
        query,
        result: {
          commits: [
            commitInfo(first, { subject: 'subject 0' }),
            commitInfo('e'.repeat(40), {
              subject: 'Fix the abcd parser',
              authorName: 'Abcd Author',
            }),
          ],
          capped,
        },
      },
    });
    const html = popup('abcd', found([first]), byText('abcd'));
    assert.deepStrictEqual(counts(html), [2]);
    assert.match(html, /subject 0<\/span><\/div>/);
    assert.match(
      html,
      /Fix the <mark class="match">abcd<\/mark> parser<\/span><\/div>/,
    );
    assert.match(html, /<mark class="match">Abcd<\/mark> Author/);
    assert.doesNotMatch(html, /Searching commits/);
    assert.match(
      popup('abcd', found([first]), byText('abcd', true)),
      /More commits match; type more to narrow it down/,
    );
  });

  test('searches commits by text from three characters, saying so until the results come, and only then that nothing matches', () => {
    assert.match(popup('parser'), /Searching commits…/);
    assert.doesNotMatch(popup('parser'), /No matches/);
    const none = popup('parser', undefined, {
      commitSearch: {
        type: 'commitSearch',
        query: 'parser',
        result: { commits: [], capped: false },
      },
    });
    assert.doesNotMatch(none, /Searching commits/);
    assert.match(none, /No matches/);
    assert.match(popup('par'), /Searching commits…/);
    assert.doesNotMatch(popup('pa'), /Searching commits/);
    assert.match(popup('pa'), /No matches/);
  });

  test('offers nothing for what is no hash, or too short', () => {
    assert.doesNotMatch(popup('ab'), /hash-suggestion|Commits/);
    assert.doesNotMatch(popup('abc'), /Looking for commit|Commits/);
    assert.doesNotMatch(popup('feature'), /Looking for commit|Commits/);
  });
});

const repository = (...refs: [RefInfo['kind'], string][]): RepositoryState => ({
  head: undefined,
  headCommit: undefined,
  refs: refs.map(([kind, name]) => ({ kind, name, commit: 'c'.repeat(40) })),
});

const refs = repository(
  ['branch', 'main'],
  ['branch', 'feat/a'],
  ['branch', 'feat/b'],
  ['remote', 'origin/main'],
  ['tag', 'v1'],
);

const counts = (html: string) =>
  [...html.matchAll(/class="locations-count">(\d+)</g)].map((match) =>
    Number(match[1]),
  );

suite('Search', () => {
  test('offers a way back out beside its field', () => {
    let closed = 0;
    const element = renderedBy(LocationsPopup, {
      bookmarks: [],
      repository: undefined,
      anchor: { current: null },
      lookup: undefined,
      onLookup: noop,
      commitSearch: undefined,
      onSearchCommits: noop,
      onJump: noop,
      onClose: () => closed++,
      query: '',
      onQuery: noop,
    });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(element));
    const row = element.props.children[0];
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(row));
    const back = row.props.children[0];
    assert.ok(isValidElement<{ title: string; onClick: () => void }>(back));
    assert.strictEqual(back.props.title, 'Close (Esc)');
    back.props.onClick();
    assert.strictEqual(closed, 1);
  });

  test('shows refs as trees, folders first, opening a lone folder', () => {
    const html = popup('', undefined, { repository: refs });
    assert.deepStrictEqual(counts(html), [3, 1, 1]);
    assert.match(
      html,
      /tree-row folder[^>]*><span class="twisty">▸<\/span>feat<\/div><\/div><div[^>]*title="main"/,
    );
    assert.match(
      tagWith(html, 'title="main"', 'tree-row', 'leaf'),
      new RegExp(`padding-left:${leafIndent(0, true)}px`),
    );
    assert.match(
      tagWith(html, 'title="origin/main"', 'tree-row', 'leaf'),
      new RegExp(`padding-left:${leafIndent(1, false)}px`),
    );
    assert.match(
      tagWith(html, 'title="v1"', 'tree-row', 'leaf'),
      new RegExp(`padding-left:${leafIndent(0, false)}px`),
    );
  });

  test('keeps several folders closed and says when a kind has none', () => {
    const html = popup('', undefined, {
      repository: repository(
        ['branch', 'main'],
        ['remote', 'origin/a'],
        ['remote', 'upstream/b'],
      ),
    });
    assert.deepStrictEqual(counts(html), [1, 2, 0]);
    const folders = tagsWith(html, 'row', 'tree-row', 'folder', 'sticky');
    assert.strictEqual(folders.length, 2);
    for (const folder of folders) {
      assert.match(folder, /z-index:100/);
      assert.ok(!folder.includes('title='));
    }
    assert.match(html, /<\/span>origin<\/div>/);
    assert.match(html, /<\/span>upstream<\/div>/);
    assert.strictEqual(html.match(/class="twisty">▸</g)?.length, 2);
    assert.match(html, /<div class="locations-empty">None<\/div>/);
  });

  test('marks what matches, counting only the matches and leaving out the groups without any', () => {
    const html = popup('fe', undefined, { repository: refs });
    assert.match(html, /<mark class="match">fe<\/mark>at\/a/);
    assert.deepStrictEqual(counts(html), [2]);
    assert.doesNotMatch(html, /No matches/);
  });

  test('shows the trees for a search of spaces alone, as for no search', () => {
    const html = popup(' ', undefined, { repository: refs });
    assert.deepStrictEqual(counts(html), [3, 1, 1]);
    assert.doesNotMatch(html, /No matches/);
    assert.strictEqual(tagsWith(html, 'row', 'tree-row', 'leaf').length, 3);
  });

  test('says there are no matches once, when nothing matches', () => {
    const html = popup('nothing like it', undefined, {
      repository: refs,
      ...searched('nothing like it'),
    });
    assert.deepStrictEqual(counts(html), []);
    assert.strictEqual(
      html.match(/<div class="locations-empty">No matches<\/div>/g)?.length,
      1,
    );
  });

  test('marks a match ignoring case, and highlights the first one, skipping groups without any', () => {
    assert.match(
      popup('MAI', undefined, { repository: refs }),
      /<mark class="match">mai<\/mark>n/,
    );
    const html = popup('v1', undefined, { repository: refs });
    const active = tagsWith(html, 'row', 'result', 'active');
    assert.strictEqual(active.length, 1);
    assert.match(active[0], /title="v1"/);
  });

  test('pins the checked-out branch and bookmarks, showing one that is gone as such', () => {
    const html = popup('', undefined, {
      repository: { ...refs, head: 'main' },
      bookmarks: [{ kind: 'branch', name: 'gone' }],
    });
    assert.match(
      html,
      /<header class="locations-heading">Checked out<span class="locations-count">1<\/span><\/header><div class="locations-list"><div[^>]*><span class="badge branch[^"]*"[^>]*>main</,
    );
    assert.match(
      html,
      /<header class="locations-heading">Bookmarks<span class="locations-count">1<\/span><\/header><div class="locations-list"><div[^>]*><span class="badge branch[^"]* missing[^"]*"[^>]*>gone</,
    );
  });

  test('says how many more match than it shows', () => {
    const many = repository(
      ...Array.from({ length: 201 }, (_, index): [RefInfo['kind'], string] => [
        'branch',
        `b${index}`,
      ]),
    );
    const html = popup('b', undefined, { repository: many });
    assert.match(html, /1 more; type more to narrow it down/);
    assert.strictEqual(counts(html)[0], 201);
  });
});

suite('Menu items', () => {
  test('keys items apart that have the same label', () => {
    const items = renderedBy(MenuItems, {
      items: [
        { label: 'v1', onClick: noop },
        { separator: true },
        { label: 'v1', onClick: noop },
      ],
      onClose: noop,
    });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(items));
    const keys = items.props.children.map((item) => item.key);
    assert.strictEqual(new Set(keys).size, 3);
  });

  test('runs a plain item and closes the menu, but keeps it open on a submenu', () => {
    const log: string[] = [];
    const items = renderedBy(MenuItems, {
      items: [
        { label: 'a', onClick: () => log.push('a') },
        { label: 'sub', submenu: [{ label: 'x', onClick: noop }] },
      ],
      onClose: () => log.push('close'),
    });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(items));
    const [plain, sub] = items.props.children.map((entry) => {
      assert.ok(isValidElement<{ children: React.ReactNode[] }>(entry));
      const button = entry.props.children[0];
      assert.ok(
        isValidElement<{ onClick: (event: { detail: number }) => void }>(
          button,
        ),
      );
      return button;
    });
    plain.props.onClick({ detail: 1 });
    assert.deepStrictEqual(log, ['close', 'a']);
    sub.props.onClick({ detail: 1 });
    assert.deepStrictEqual(log, ['close', 'a']);
  });

  test('opens a submenu in place of running it, focusing its first item only on a click from the keyboard', () => {
    const submenu = [{ label: 'x', onClick: noop }];
    assert.deepStrictEqual(openedSubmenu({ submenu }, 0), {
      focusFirst: true,
    });
    assert.deepStrictEqual(openedSubmenu({ submenu }, 1), {
      focusFirst: false,
    });
    assert.strictEqual(openedSubmenu({}, 0), undefined);
  });

  test('marks the items that are on with a check', () => {
    const html = renderToStaticMarkup(
      <MenuItems
        items={[
          { label: 'main', checked: true, onClick: noop },
          { label: 'Collapse', checked: false, onClick: noop },
        ]}
        onClose={noop}
      />,
    );
    assert.match(
      html,
      /role="menuitemcheckbox" aria-checked="true"><span class="menu-check">✓<\/span>main/,
    );
    assert.match(
      html,
      /role="menuitemcheckbox" aria-checked="false"><span class="menu-check"><\/span>Collapse/,
    );
  });

  test('separates groups and greys out what cannot run', () => {
    const html = renderToStaticMarkup(
      <MenuItems
        items={[
          { label: 'Copy', onClick: noop },
          { separator: true },
          { label: 'Checkout', disabled: true, onClick: noop },
        ]}
        onClose={noop}
      />,
    );
    assert.strictEqual(tagsWith(html, 'menu-separator').length, 1);
    assert.match(html, /role="menuitem"[^>]*disabled=""[^>]*>Checkout/);
  });
});

suite('Window', () => {
  test('says no repository is open only once the host says which tabs are', () => {
    const html = renderToStaticMarkup(
      <App name="Fastforward" post={noop} listen={() => noop} />,
    );
    assert.strictEqual(tagsWith(html, 'tabs').length, 1);
    assert.doesNotMatch(html, /No repository is open/);
  });
});

const rested = () =>
  new Promise((resolve) => setTimeout(resolve, preloadDelay + 20));

suite('Tab bar', () => {
  test('acts on what the pointer rests on, not on what it only passes over', async () => {
    const done: string[] = [];
    const rest = resting(10);
    rest.start(() => done.push('a'));
    rest.start(() => done.push('b'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepStrictEqual(done, ['b']);
    rest.start(() => done.push('c'));
    rest.cancel();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepStrictEqual(done, ['b']);
  });

  test('offers sorting the tabs and opening the settings files in its menu', () => {
    const picked: string[] = [];
    const nav = renderedBy(TabBar, {
      tabs: [],
      active: undefined,
      onSelect: noop,
      onPreload: noop,
      onClose: noop,
      onAdd: noop,
      onSort: () => picked.push('sort'),
      onOpenSettings: () => picked.push('settings'),
      onOpenDefaultSettings: () => picked.push('defaults'),
      onLog: noop,
    });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(nav));
    const menu = nav.props.children[1];
    assert.ok(isValidElement<{ items: readonly ContextMenuItem[] }>(menu));
    const items = menu.props.items.flatMap((item) =>
      'separator' in item ? [] : [item],
    );
    assert.deepStrictEqual(
      items.map((item) => item.label),
      ['Sort A-Z', 'Open Default Settings', 'Open User Settings'],
    );
    for (const item of items) {
      item.onClick?.();
    }
    assert.deepStrictEqual(picked, ['sort', 'defaults', 'settings']);
  });

  test('stops the middle button from autoscrolling, so a middle click closes the tab', () => {
    const closed: string[] = [];
    const nav = renderedBy(TabBar, {
      tabs: [{ root: '/repo', name: 'repo' }],
      active: '/repo',
      onSelect: noop,
      onPreload: noop,
      onClose: (root) => closed.push(root),
      onAdd: noop,
      onSort: noop,
      onOpenSettings: noop,
      onOpenDefaultSettings: noop,
      onLog: noop,
    });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(nav));
    const list = nav.props.children[0];
    assert.ok(isValidElement<{ children: React.ReactElement[][] }>(list));
    const tab = list.props.children[0][0];
    assert.ok(
      isValidElement<{
        onMouseDown: (event: {
          button: number;
          preventDefault: () => void;
        }) => void;
        onAuxClick: (event: { button: number }) => void;
      }>(tab),
    );
    let prevented = 0;
    const preventDefault = () => prevented++;
    tab.props.onMouseDown({ button: 0, preventDefault });
    assert.strictEqual(prevented, 0);
    tab.props.onMouseDown({ button: 1, preventDefault });
    assert.strictEqual(prevented, 1);
    tab.props.onAuxClick({ button: 1 });
    assert.deepStrictEqual(closed, ['/repo']);
  });

  test('preloads only a tab not shown that the pointer rests on, and closes one only by its button or the middle button', async () => {
    const preloaded: string[] = [];
    const closed: string[] = [];
    const nav = renderedBy(TabBar, {
      tabs: [
        { root: '/a', name: 'a' },
        { root: '/b', name: 'b' },
      ],
      active: '/a',
      onSelect: noop,
      onPreload: (root) => preloaded.push(root),
      onClose: (root) => closed.push(root),
      onAdd: noop,
      onSort: noop,
      onOpenSettings: noop,
      onOpenDefaultSettings: noop,
      onLog: noop,
    });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(nav));
    const list = nav.props.children[0];
    assert.ok(isValidElement<{ children: React.ReactElement[][] }>(list));
    const [a, b] = list.props.children[0];
    type Tab = {
      onPointerEnter: () => void;
      onPointerLeave: () => void;
      onClick: () => void;
      onAuxClick: (event: { button: number }) => void;
      children: React.ReactElement[];
    };
    assert.ok(isValidElement<Tab>(a) && isValidElement<Tab>(b));
    a.props.onPointerEnter();
    b.props.onPointerEnter();
    b.props.onPointerLeave();
    await rested();
    b.props.onPointerEnter();
    b.props.onClick();
    await rested();
    assert.deepStrictEqual(preloaded, []);
    b.props.onPointerEnter();
    await rested();
    assert.deepStrictEqual(preloaded, ['/b']);
    b.props.onAuxClick({ button: 2 });
    assert.deepStrictEqual(closed, []);
    const close = a.props.children[1];
    assert.ok(
      isValidElement<{
        onClick: (event: { stopPropagation: () => void }) => void;
      }>(close),
    );
    let stopped = 0;
    close.props.onClick({ stopPropagation: () => stopped++ });
    assert.strictEqual(stopped, 1);
    assert.deepStrictEqual(closed, ['/a']);
  });
});

suite('Worktree bar', () => {
  type Worktree = {
    title: string;
    className: string;
    onPointerEnter: () => void;
    onClick?: () => void;
    children: React.ReactNode[];
  };

  function worktreesOf(
    selected: string[],
    preloaded: string[],
  ): React.ReactElement<Worktree>[] {
    const nav = renderedBy(WorktreeBar, {
      worktrees: [
        { root: '/a', name: 'main', folder: 'app', main: true, missing: false },
        {
          root: '/b',
          name: 'gone',
          folder: 'gone',
          main: false,
          missing: true,
        },
        {
          root: '/c',
          name: 'feature',
          folder: 'app-feature',
          main: false,
          missing: false,
        },
      ],
      active: '/a',
      onSelect: (root) => selected.push(root),
      onPreload: (root) => preloaded.push(root),
    });
    assert.ok(isValidElement<{ children: React.ReactElement }>(nav));
    const list = nav.props.children;
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(list));
    return list.props.children.map((worktree) => {
      assert.ok(isValidElement<Worktree>(worktree));
      return worktree;
    });
  }

  test('marks the main worktree and the one shown, naming each folder in its tooltip', () => {
    const [main, gone, feature] = worktreesOf([], []);
    assert.strictEqual(main.props.title, '/a');
    assert.match(main.props.className, /\bactive\b/);
    assert.ok(isValidElement(main.props.children[0]));
    assert.strictEqual(feature.props.children[0], false);
    assert.doesNotMatch(feature.props.className, /\bactive\b/);
    assert.match(gone.props.className, /\bmissing\b/);
    assert.strictEqual(gone.props.title, "/b doesn't exist anymore");
  });

  test('shows the folder of a linked worktree dimmed after its branch, unless they are named the same', () => {
    const [main, gone, feature] = worktreesOf([], []);
    const shown = feature.props.children[2];
    assert.ok(isValidElement<{ className: string; children: string }>(shown));
    assert.strictEqual(shown.props.className, 'tab-folder');
    assert.strictEqual(shown.props.children, 'app-feature');
    assert.strictEqual(main.props.children[2], false);
    assert.strictEqual(gone.props.children[2], false);
  });

  test('opens and preloads a worktree, but neither a missing one', async () => {
    const selected: string[] = [];
    const preloaded: string[] = [];
    const [, gone, feature] = worktreesOf(selected, preloaded);
    gone.props.onPointerEnter();
    gone.props.onClick?.();
    await rested();
    assert.deepStrictEqual([selected, preloaded], [[], []]);
    feature.props.onPointerEnter();
    await rested();
    feature.props.onClick?.();
    assert.deepStrictEqual([selected, preloaded], [['/c'], ['/c']]);
  });
});

suite('Placeholders', () => {
  test('draws grey bars in rows of the given kind', () => {
    const html = renderToStaticMarkup(
      <SkeletonRows count={3} className="diff-line" />,
    );
    assert.strictEqual(tagsWith(html, 'diff-line', 'skeleton-row').length, 3);
    assert.match(html, /aria-busy="true"/);
  });
});

const cell = (row: GraphRow, height = 30) =>
  renderToStaticMarkup(
    <GraphCell row={row} height={height} onToggleMerge={noop} />,
  );

const attributes = (html: string, tag: string, name: string) =>
  [...html.matchAll(new RegExp(`<${tag}[^>]* ${name}="([^"]*)"`, 'g'))].map(
    (match) => match[1],
  );

const titles = (html: string) =>
  [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((match) => match[1]);

suite('Graph cell', () => {
  test('draws lines to the foot of the row, curving between lanes, dashed where asked', () => {
    const html = cell(
      {
        lane: 0,
        color: 0,
        lines: [
          { from: 0, to: 0, color: 0, bottom: false },
          { from: 0, to: 1, color: 1, bottom: false, dashed: true },
          { from: 0, to: 0, color: 0, bottom: true },
          { from: 0, to: 1, color: 1, bottom: true },
        ],
      },
      50,
    );
    assert.deepStrictEqual(attributes(html, 'path', 'd'), [
      'M 9 0 V 15',
      'M 9 0 C 9 7.5 21 7.5 21 15',
      'M 9 15 V 50',
      'M 9 15 C 9 25 21 25 21 35 V 50',
    ]);
    assert.deepStrictEqual(
      [...html.matchAll(/<path[^>]*>/g)].map((match) =>
        match[0].includes('stroke-dasharray="2 3"'),
      ),
      [false, true, false, false],
    );
  });

  test('keeps a dashed and a solid copy of the same line apart', () => {
    const line = { from: 0, to: 0, color: 0, bottom: true };
    const html = cell({
      lane: 0,
      color: 0,
      lines: [line, { ...line, dashed: true }],
    });
    assert.strictEqual(attributes(html, 'path', 'd').length, 2);
  });

  test('folds lanes past the widest graph onto its last lane, and cycles colors', () => {
    const html = cell({
      lane: 15,
      color: 8,
      lines: [{ from: 15, to: 20, color: 9, bottom: true }],
    });
    assert.deepStrictEqual(attributes(html, 'svg', 'width'), ['150']);
    assert.deepStrictEqual(attributes(html, 'circle', 'cx'), ['141']);
    assert.deepStrictEqual(attributes(html, 'circle', 'fill'), [
      'var(--color-chart-blue)',
    ]);
    assert.deepStrictEqual(attributes(html, 'path', 'd'), ['M 141 15 V 30']);
    assert.deepStrictEqual(attributes(html, 'path', 'stroke'), [
      'var(--color-chart-green)',
    ]);
  });

  test('is as wide as the lanes its dot and lines reach, from one to twelve', () => {
    assert.strictEqual(rowLanes(undefined), 1);
    assert.strictEqual(
      rowLanes({
        lane: 0,
        color: 0,
        lines: [{ from: 0, to: 3, color: 0, bottom: true }],
      }),
      4,
    );
    assert.strictEqual(
      rowLanes({
        lane: 2,
        color: 0,
        lines: [{ from: 4, to: 2, color: 0, bottom: false }],
      }),
      5,
    );
    assert.strictEqual(graphWidth(0), 18);
    assert.strictEqual(graphWidth(3), 42);
    assert.strictEqual(graphWidth(20), 150);
  });

  test('draws a merge as a ring sized and titled by what it hides, the working tree as a square', () => {
    const merge = (hidden: number | undefined) =>
      cell({ lane: 0, color: 0, lines: [], merge: 'collapsed', hidden });
    for (const [hidden, title, radius] of [
      [undefined, 'Expand merge', '3.5'],
      [0, 'Expand merge', '3.5'],
      [1, '1 commit merged, click to expand', '3.5'],
      [2, '2 commits merged, click to expand', '4.5'],
      [7, '7 commits merged, click to expand', '5'],
      [12, '12 commits merged, click to expand', '5.5'],
      [60, '60 commits merged, click to expand', '6'],
    ] as const) {
      const html = merge(hidden);
      assert.deepStrictEqual(titles(html), [title]);
      assert.deepStrictEqual(attributes(html, 'circle', 'r'), ['8', radius]);
    }

    const expanded = cell({ lane: 0, color: 0, lines: [], merge: 'expanded' });
    assert.deepStrictEqual(titles(expanded), ['Collapse merge']);
    assert.deepStrictEqual(attributes(expanded, 'circle', 'r'), [
      '8',
      '4',
      '1.5',
    ]);

    const workingTree = cell({
      lane: 0,
      color: 0,
      lines: [],
      workingTree: true,
    });
    assert.match(workingTree, /<rect/);
    assert.doesNotMatch(workingTree, /<circle|merge-dot/);

    const plain = cell({ lane: 0, color: 0, lines: [] });
    assert.deepStrictEqual(attributes(plain, 'circle', 'r'), ['4']);
    assert.doesNotMatch(plain, /merge-dot|<rect/);
  });
});
