import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { changesTreeElements, changesTreeRows } from '../webview/changesTree';
import {
  CheckedOutBranch,
  CommitBubble,
  HeadBubble,
  RefBubble,
} from '../webview/bubbles';
import {
  MenuItems,
  OpenContextMenu,
  type MenuTarget,
} from '../webview/contextMenu';
import { LocationsPopup } from '../webview/locations';
import {
  AddressBar,
  historyButtonClick,
  HistoryMenu,
  NavButtons,
  nextPeekMode,
} from '../webview/navBar';
import { parsePatch } from '../webview/diff';
import { diffRows } from '../webview/diffView';
import { changeTitle, statusClass } from '../webview/fileStatus';
import { Files } from '../webview/filesColumn';
import { LineCounts } from '../webview/lineCounts';
import { SkeletonRows } from '../webview/skeleton';
import { TabBar } from '../webview/tabBar';
import { GraphCell, graphWidth, rowLanes } from '../webview/graph';
import { FileRow, treeIndent } from '../webview/tree';
import type { GraphRow } from '../shared/protocol';
import { classesOf, fileChange as change, tagsWith } from './fixtures';

const noop = () => {};

const kinds = (rows: ReturnType<typeof diffRows>) =>
  rows.map((row) => row.kind);

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
    assert.strictEqual(statusClass(change('a.ts')), 'path status-M');
  });
});

suite('Line counts', () => {
  test('leaves out a side without lines, and shows nothing without any', () => {
    assert.strictEqual(
      renderToStaticMarkup(<LineCounts deletions={0} insertions={3} />),
      '<span class="line-counts"><span class="insertions">+3</span></span>',
    );
    assert.strictEqual(
      renderToStaticMarkup(<LineCounts deletions={0} insertions={0} />),
      '',
    );
  });
});

interface RowProps {
  className: string;
  onClick: () => void;
}

function changesRows(
  files: ReturnType<typeof change>[],
  selected: string | undefined,
  onSelect: (path: string | undefined) => void,
) {
  let column: React.ReactNode;
  function Probe() {
    column = Files({
      mode: 'changes',
      onMode: noop,
      changesView: 'list',
      onChangesView: noop,
      closedFolders: new Set(),
      onToggleClosedFolder: noop,
      files,
      loading: false,
      treeLoading: false,
      tree: undefined,
      openFolders: new Set(),
      onToggleFolder: noop,
      selected,
      onSelect,
    });
    return null;
  }
  renderToStaticMarkup(<Probe />);
  assert.ok(isValidElement<{ children: React.ReactNode[] }>(column));
  const list = column.props.children[1];
  assert.ok(
    isValidElement<{
      rows: React.ReactElement<RowProps>[];
      selectedKey: string | undefined;
    }>(list),
  );
  return list.props;
}

function clickFile(row: React.ReactElement) {
  assert.strictEqual(row.type, FileRow);
  assert.ok(isValidElement<Parameters<typeof FileRow>[0]>(row));
  const drawn = FileRow(row.props);
  assert.ok(isValidElement<RowProps>(drawn));
  drawn.props.onClick();
}

suite('Files column', () => {
  test('shows no rows without changes, not even their header', () => {
    assert.deepStrictEqual(changesRows([], undefined, noop).rows, []);
  });

  test('deselects the selected file on a click, and selects another', () => {
    const picked: (string | undefined)[] = [];
    const { rows, selectedKey } = changesRows(
      [change('a.ts'), change('b.ts')],
      'a.ts',
      (path) => picked.push(path),
    );
    assert.strictEqual(selectedKey, 'file:a.ts');
    assert.deepStrictEqual(
      rows.map((row) => row.key),
      ['changes', 'file:a.ts', 'file:b.ts'],
    );
    clickFile(rows[1]);
    clickFile(rows[2]);
    assert.deepStrictEqual(picked, [undefined, 'b.ts']);
  });

  test('selects all changes with their header, marked while no file is', () => {
    const picked: (string | undefined)[] = [];
    const [header] = changesRows([change('a.ts')], undefined, (path) =>
      picked.push(path),
    ).rows;
    assert.match(header.props.className, /\bselected\b/);
    header.props.onClick();
    assert.deepStrictEqual(picked, [undefined]);
    const [unmarked] = changesRows([change('a.ts')], 'a.ts', noop).rows;
    assert.doesNotMatch(unmarked.props.className, /\bselected\b/);
  });
});

suite('File rows', () => {
  test('draws a row outside a tree without its indent', () => {
    const html = renderToStaticMarkup(
      <FileRow
        path="src/a.ts"
        name="src/a.ts"
        change={change('src/a.ts')}
        selected="src/a.ts"
        onSelect={noop}
      />,
    );
    const row = tagWith(
      html,
      'title="Modified: src/a.ts"',
      'row',
      'file',
      'selected',
    );
    assert.ok(!classesOf(row).has('tree-row'));
    assert.ok(!row.includes('padding-left'));
  });

  test('names an unchanged file by its path, without line counts', () => {
    const html = renderToStaticMarkup(
      <FileRow
        path="src/a.ts"
        name="a.ts"
        depth={1}
        change={undefined}
        selected={undefined}
        onSelect={noop}
      />,
    );
    tagWith(html, 'title="src/a.ts"', 'row', 'tree-row', 'file');
    tagWith(html, '', 'path');
    assert.deepStrictEqual(tagsWith(html, 'line-counts'), []);
  });
});

suite('Changes tree rows', () => {
  test('draws folders and files, marking the selected file', () => {
    const files = [change('src/a.ts'), change('src/b.ts')];
    const html = renderToStaticMarkup(
      <>
        {changesTreeElements({
          rows: changesTreeRows(files, new Set()),
          onToggle: noop,
          selected: 'src/b.ts',
          onSelect: noop,
        })}
      </>,
    );
    tagWith(html, 'title="src"', 'row', 'tree-row', 'folder', 'counted');
    tagWith(html, 'title="Modified: src/b.ts"', 'row', 'file', 'selected');
    const a = tagWith(html, 'title="Modified: src/a.ts"', 'row', 'file');
    assert.ok(!classesOf(a).has('selected'));
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

  test('shows the placeholder in the search field', () => {
    const html = renderToStaticMarkup(
      <AddressBar
        root="/repo"
        bookmarks={[]}
        repository={undefined}
        selected={undefined}
        hashLookup={undefined}
        onLookupHash={noop}
        onJump={noop}
      />,
    );
    tagWith(html, 'title="Search branches', 'address-bar');
    assert.match(html, /class="address-text empty">Search…<\/span>/);
  });

  test('spins the fetch button while fetching', () => {
    const spinning = tagWith(
      buttons({ fetching: true }),
      'title="Fetch',
      'nav-button',
      'running',
    );
    assert.match(spinning, /disabled=""/);
    const idle = tagWith(buttons({}), 'title="Fetch', 'nav-button');
    assert.ok(!classesOf(idle).has('running'));
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

suite('Peek', () => {
  test('peeks when the pointer rests, and closes a peek when it leaves', () => {
    assert.strictEqual(nextPeekMode('closed', 'rest'), 'peek');
    assert.strictEqual(nextPeekMode('peek', 'leave'), 'closed');
    assert.strictEqual(nextPeekMode('open', 'rest'), 'open');
    assert.strictEqual(nextPeekMode('open', 'leave'), 'open');
  });

  test('toggles a peek from the keyboard, but not what a click opened', () => {
    assert.strictEqual(nextPeekMode('closed', 'toggle'), 'pinned');
    assert.strictEqual(nextPeekMode('pinned', 'toggle'), 'closed');
    assert.strictEqual(nextPeekMode('peek', 'toggle'), 'closed');
    assert.strictEqual(nextPeekMode('open', 'toggle'), 'open');
  });

  test('keeps a peek from the keyboard when the pointer leaves', () => {
    assert.strictEqual(nextPeekMode('pinned', 'leave'), 'pinned');
    assert.strictEqual(nextPeekMode('pinned', 'rest'), 'pinned');
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

  test('keys history entries apart that are the same commit', () => {
    const a = 'a'.repeat(40);
    let menu: React.ReactNode;
    function Probe() {
      menu = HistoryMenu({
        container: { current: null },
        entries: [
          { hash: a, subject: 'a' },
          { hash: 'b'.repeat(40), subject: 'b' },
          { hash: a, subject: 'a' },
        ],
        onPick: noop,
        onClose: noop,
      });
      return null;
    }
    renderToStaticMarkup(<Probe />);
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(menu));
    const keys = menu.props.children.map((entry) => entry.key);
    assert.strictEqual(new Set(keys).size, 3);
  });
});

const popup = (
  query: string,
  result?: Parameters<typeof LocationsPopup>[0]['lookup'],
) =>
  renderToStaticMarkup(
    <LocationsPopup
      bookmarks={[]}
      repository={undefined}
      selected={undefined}
      anchor={{ current: null }}
      lookup={result}
      onLookup={noop}
      onJump={noop}
      onClose={noop}
      query={query}
      onQuery={noop}
    />,
  );

suite('Hash suggestion', () => {
  const hash = 'abcd'.padEnd(40, '0');
  test('offers the commit a typed hash is, like a first suggestion', () => {
    const html = popup('ABCD', {
      type: 'hashLookup',
      query: 'abcd',
      result: { kind: 'found', hash, subject: 'the subject' },
    });
    assert.strictEqual(
      tagsWith(html, 'row', 'hash-suggestion', 'active').length,
      1,
    );
    assert.match(html, /Go to commit.*abcd000.*the subject/);
  });

  test('says when no commit or several start with it', () => {
    assert.match(
      popup('abcd', {
        type: 'hashLookup',
        query: 'abcd',
        result: { kind: 'none' },
      }),
      /No commit starts with abcd/,
    );
    assert.match(
      popup('abcd', {
        type: 'hashLookup',
        query: 'abcd',
        result: { kind: 'ambiguous', count: 3 },
      }),
      /3 commits start with abcd, type more/,
    );
    assert.match(popup('abcd'), /Looking for commit abcd/);
  });

  test('offers nothing for what is no hash, or too short', () => {
    assert.doesNotMatch(popup('abc'), /hash-suggestion/);
    assert.doesNotMatch(popup('feature'), /hash-suggestion/);
  });
});

suite('Search', () => {
  test('offers a way back out beside its field', () => {
    tagWith(popup(''), 'title="Close (Esc)"', 'nav-button');
  });
});

suite('Menu items', () => {
  test('keys items apart that have the same label', () => {
    let items: React.ReactNode;
    function Probe() {
      items = MenuItems({
        items: [
          { label: 'v1', onClick: noop },
          { separator: true },
          { label: 'v1', onClick: noop },
        ],
        onClose: noop,
      });
      return null;
    }
    renderToStaticMarkup(<Probe />);
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(items));
    const keys = items.props.children.map((item) => item.key);
    assert.strictEqual(new Set(keys).size, 3);
  });

  test('marks the picked one of several, and switches with a check', () => {
    const html = renderToStaticMarkup(
      <MenuItems
        items={[
          { label: 'View as List', checked: true, radio: true, onClick: noop },
          { label: 'Collapse', checked: false, onClick: noop },
          { separator: true },
          { label: 'Checkout', disabled: true, onClick: noop },
        ]}
        onClose={noop}
      />,
    );
    assert.match(html, /role="menuitemradio" aria-checked="true"/);
    assert.match(html, /role="menuitemcheckbox" aria-checked="false"/);
    assert.strictEqual(tagsWith(html, 'menu-separator').length, 1);
    assert.match(html, /role="menuitem"[^>]*disabled=""/);
  });
});

suite('Tab bar', () => {
  test('stops the middle button from autoscrolling, so a middle click closes the tab', () => {
    const closed: string[] = [];
    let nav: React.ReactNode;
    function Probe() {
      nav = TabBar({
        tabs: [{ root: '/repo', name: 'repo' }],
        active: '/repo',
        onSelect: noop,
        onPreload: noop,
        onClose: (root) => closed.push(root),
        onAdd: noop,
        onSort: noop,
        onLog: noop,
      });
      return null;
    }
    renderToStaticMarkup(<Probe />);
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
});

suite('Placeholders', () => {
  test('draws grey bars in rows of the given kind', () => {
    const html = renderToStaticMarkup(
      <SkeletonRows count={3} className="diff-line" />,
    );
    assert.strictEqual(tagsWith(html, 'diff-line', 'skeleton-row').length, 3);
    assert.match(html, /aria-busy="true"/);
  });

  test('indent their stand-in tree rows like the tree indents its levels', () => {
    const html = renderToStaticMarkup(<SkeletonRows count={4} indent />);
    assert.deepStrictEqual(
      [...html.matchAll(/padding-left:(\d+)px/g)].map((match) =>
        Number(match[1]),
      ),
      [0, 1, 2, 0].map(treeIndent),
    );
  });

  test('stand in for a diff that loads, and a large file being fetched', () => {
    assert.deepStrictEqual(kinds(diffRows([], new Map(), undefined, true)), [
      'error',
      'skeleton',
    ]);
    const large = {
      path: 'graph.json',
      binary: false,
      hunks: [],
      placeholder: { lines: 5000 },
    };
    assert.deepStrictEqual(kinds(diffRows([large], new Map(), undefined)), [
      'error',
      'file',
      'large',
    ]);
    assert.deepStrictEqual(
      kinds(diffRows([large], new Map([['graph.json', true]]), undefined)),
      ['error', 'file', 'skeletonLines'],
    );
  });

  test('shows a binary file as such, whole or in a diff', () => {
    assert.deepStrictEqual(
      kinds(
        diffRows([], new Map(), { path: 'a.png', content: '', binary: true }),
      ),
      ['error', 'file', 'binary'],
    );
    const [binary] = parsePatch(
      [
        'diff --git a/a.png b/a.png',
        'index 1111111..2222222 100644',
        'Binary files a/a.png and b/a.png differ',
      ].join('\n'),
    );
    assert.deepStrictEqual(kinds(diffRows([binary], new Map(), undefined)), [
      'error',
      'file',
      'binary',
    ]);
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
  test('draws a line repeated in a row once, over the lines its last copy was over', () => {
    const a = { from: 0, to: 0, color: 0, bottom: false };
    const b = { from: 1, to: 1, color: 1, bottom: false };
    const html = renderToStaticMarkup(
      <GraphCell
        row={{ lane: 0, color: 0, lines: [a, b, a] }}
        height={30}
        onToggleMerge={noop}
      />,
    );
    assert.deepStrictEqual(
      [...html.matchAll(/<path[^>]*stroke="([^"]*)"/g)].map(
        (match) => match[1],
      ),
      ['var(--vscode-charts-green)', 'var(--vscode-charts-blue)'],
    );
  });

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
      'var(--vscode-charts-blue)',
    ]);
    assert.deepStrictEqual(attributes(html, 'path', 'd'), ['M 141 15 V 30']);
    assert.deepStrictEqual(attributes(html, 'path', 'stroke'), [
      'var(--vscode-charts-green)',
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
