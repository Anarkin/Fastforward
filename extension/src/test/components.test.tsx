import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { changesTreeElements, changesTreeRows } from '../webview/changesTree';
import { MenuItems } from '../webview/contextMenu';
import { LocationsPopup } from '../webview/locations';
import {
  historyButtonClick,
  HistoryMenu,
  MessagePeek,
  NavBar,
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
import { GraphCell } from '../webview/graph';
import {
  cardCommit,
  classesOf,
  definitions,
  fileChange as change,
  tagsWith,
} from './fixtures';

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
    rows[1].props.onClick();
    rows[2].props.onClick();
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

const bar = (props: Partial<Parameters<typeof NavBar>[0]>) =>
  renderToStaticMarkup(
    <NavBar
      root="/repo"
      address={{ hash: undefined, subject: undefined, commit: undefined }}
      repository={undefined}
      selected={undefined}
      hashLookup={undefined}
      onLookupHash={noop}
      onJump={noop}
      {...props}
    />,
  );

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

const peek = (commit: Parameters<typeof cardCommit>[0]) =>
  renderToStaticMarkup(
    <MessagePeek commit={cardCommit(commit)} onOpen={noop} />,
  );

suite('Navigation bar', () => {
  test('greys out back and forward without steps', () => {
    const html = buttons({
      back: [{ hash: 'a'.repeat(40), subject: 'a' }],
    });
    assert.match(html, /title="Back[^"]*"(?![^>]*disabled)/);
    assert.match(html, /title="Forward[^"]*" disabled=""/);
  });

  test('shows the selected commit like an address, hash and subject on one line of text', () => {
    const html = bar({
      address: {
        hash: 'd1f0050454a27f025c6820fc4a42b101a7fa356a',
        subject: 'chore: trim verification',
        commit: undefined,
      },
    });
    assert.strictEqual(tagsWith(html, 'address-text').length, 1);
    assert.match(
      html,
      /class="address-hash">d1f0050<\/span>chore: trim verification<\/span>/,
    );
  });

  test('peeks at the description and details, the bar keeping its text', () => {
    const hash = 'd1f0050454a27f025c6820fc4a42b101a7fa356a';
    const html = peek({
      hash,
      subject: 'the subject',
      message: 'the subject\n\nthe body\nmore',
      authorName: 'Jozsef Simon',
      authorEmail: 'jozsef@example.com',
      authorDate: new Date(2022, 11, 14, 16, 12).getTime(),
      committerName: 'Jozsef Simon',
      committerEmail: 'jozsef@example.com',
      commitDate: new Date(2022, 11, 14, 16, 12, 30).getTime(),
    });
    assert.strictEqual(tagsWith(html, 'locations-popup', 'peek').length, 1);
    assert.match(html, /class="address-hash">d1f0050<\/span>the subject</);
    assert.match(html, /class="commit-card-body">the body\nmore<\/pre>/);
    assert.deepStrictEqual(definitions(html), [
      ['Commit', hash, 'commit-card-hash'],
      ['Author', 'Jozsef Simon <jozsef@example.com>', ''],
      ['Committer', 'same', 'same'],
      ['Authored', '2022-12-14 16:12', ''],
      ['Committed', 'same', 'same'],
    ]);
    assert.doesNotMatch(html, /<input/);
  });

  test('peeks at the details of a commit without a description', () => {
    const html = peek({ message: 'only' });
    assert.strictEqual(tagsWith(html, 'commit-card-frame', 'empty').length, 1);
    assert.strictEqual(tagsWith(html, 'commit-card-body').length, 0);
    assert.deepStrictEqual(definitions(html)[1], [
      'Author',
      'A <a@example.com>',
      '',
    ]);
  });

  test('shows the committer and when committed where they differ', () => {
    const html = peek({
      message: 'rebased',
      authorName: 'Ann',
      authorEmail: 'ann@example.com',
      authorDate: new Date(2022, 11, 14, 16, 12).getTime(),
      committerName: 'Bob',
      committerEmail: 'bob@example.com',
      commitDate: new Date(2022, 11, 20, 9, 5).getTime(),
    });
    assert.deepStrictEqual(definitions(html).slice(1), [
      ['Author', 'Ann <ann@example.com>', ''],
      ['Committer', 'Bob <bob@example.com>', ''],
      ['Authored', '2022-12-14 16:12', ''],
      ['Committed', '2022-12-20 09:05', ''],
    ]);
  });

  test("lists the commit's bubbles one to a row, without labels", () => {
    const hash = 'a'.repeat(40);
    const html = peek({
      hash,
      message: 'tagged',
      refs: [
        { kind: 'branch', name: 'main', commit: hash },
        { kind: 'tag', name: 'v1.0', commit: hash },
      ],
      detachedHead: true,
    });
    assert.deepStrictEqual(definitions(html).slice(-3), [
      ['', 'HEAD aaaaaaa', 'first-bubble'],
      ['', 'main', ''],
      ['', 'v1.0', ''],
    ]);
    tagWith(html, '', 'badge', 'head');
    tagWith(html, '', 'badge', 'branch');
    tagWith(html, '', 'badge', 'tag');
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

suite('Peek', () => {
  test('peeks when the pointer rests, and closes a peek when it leaves', () => {
    assert.strictEqual(nextPeekMode('closed', 'rest', true), 'peek');
    assert.strictEqual(nextPeekMode('closed', 'rest', false), 'closed');
    assert.strictEqual(nextPeekMode('peek', 'leave', true), 'closed');
    assert.strictEqual(nextPeekMode('open', 'rest', true), 'open');
    assert.strictEqual(nextPeekMode('open', 'leave', true), 'open');
  });

  test('toggles a peek from the keyboard, but not what a click opened', () => {
    assert.strictEqual(nextPeekMode('closed', 'toggle', true), 'pinned');
    assert.strictEqual(nextPeekMode('closed', 'toggle', false), 'closed');
    assert.strictEqual(nextPeekMode('pinned', 'toggle', true), 'closed');
    assert.strictEqual(nextPeekMode('peek', 'toggle', true), 'closed');
    assert.strictEqual(nextPeekMode('open', 'toggle', true), 'open');
  });

  test('keeps a peek from the keyboard when the pointer leaves', () => {
    assert.strictEqual(nextPeekMode('pinned', 'leave', true), 'pinned');
    assert.strictEqual(nextPeekMode('pinned', 'rest', true), 'pinned');
  });

  test('closes a peek when what it peeks at goes away', () => {
    assert.strictEqual(nextPeekMode('peek', 'update', false), 'closed');
    assert.strictEqual(nextPeekMode('pinned', 'update', false), 'closed');
    assert.strictEqual(nextPeekMode('pinned', 'update', true), 'pinned');
    assert.strictEqual(nextPeekMode('open', 'update', false), 'open');
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
      popup('abcd', { query: 'abcd', result: { kind: 'none' } }),
      /No commit starts with abcd/,
    );
    assert.match(
      popup('abcd', { query: 'abcd', result: { kind: 'ambiguous', count: 3 } }),
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
});
