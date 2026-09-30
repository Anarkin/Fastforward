import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { changesTreeElements, changesTreeRows } from '../webview/changesTree';
import { MenuItems } from '../webview/contextMenu';
import { LocationsPopup } from '../webview/locations';
import {
  historyButtonClick,
  HistoryMenu,
  NavButtons,
  nextPeekMode,
} from '../webview/navBar';
import { parsePatch } from '../webview/diff';
import { diffRows } from '../webview/diffView';
import { changeTitle, statusClass } from '../webview/fileStatus';
import { LineCounts } from '../webview/lineCounts';
import { SkeletonRows } from '../webview/skeleton';
import { TabBar } from '../webview/tabBar';
import { GraphCell } from '../webview/graph';
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
