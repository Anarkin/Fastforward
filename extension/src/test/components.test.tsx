import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FileChange } from '../protocol';
import { changesTreeElements, changesTreeRows } from '../webview/changesTree';
import { MenuItems } from '../webview/contextMenu';
import { LocationsPopup } from '../webview/locations';
import { NavBar } from '../webview/navBar';
import { parsePatch } from '../webview/diff';
import { diffRows } from '../webview/diffView';
import { changeTitle, statusClass } from '../webview/fileStatus';
import { LineCounts } from '../webview/lineCounts';
import { SkeletonRows } from '../webview/skeleton';

// The webview's components, rendered to HTML without a browser, as mocha runs
// in the extension host

const change = (path: string, extra: Partial<FileChange> = {}): FileChange => ({
  path,
  oldPath: undefined,
  status: 'M',
  insertions: 1,
  deletions: 2,
  ...extra,
});

const noop = () => {};

const kinds = (rows: ReturnType<typeof diffRows>) =>
  rows.map((row) => row.kind);

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
    assert.match(html, /class="row tree-row folder counted"[^>]*title="src"/);
    assert.match(
      html,
      /class="row tree-row file selected"[^>]*title="Modified: src\/b.ts"/,
    );
    assert.match(
      html,
      /class="row tree-row file "[^>]*title="Modified: src\/a.ts"/,
    );
  });
});

// The navigation bar with nothing to show, and these props
const bar = (props: Partial<Parameters<typeof NavBar>[0]>) =>
  renderToStaticMarkup(
    <NavBar
      root="/repo"
      back={[]}
      forward={[]}
      onNavigate={noop}
      fetching={false}
      onFetch={noop}
      address={{ hash: undefined, subject: undefined, message: undefined }}
      repository={undefined}
      selected={undefined}
      hashLookup={undefined}
      onLookupHash={noop}
      onJump={noop}
      {...props}
    />,
  );

suite('Navigation bar', () => {
  test('greys out back and forward without steps', () => {
    const html = bar({
      back: [{ hash: 'a'.repeat(40), subject: 'a' }],
    });
    assert.match(html, /title="Back[^"]*"(?![^>]*disabled)/);
    assert.match(html, /title="Forward[^"]*" disabled=""/);
  });

  test('shows the selected commit like an address', () => {
    const html = bar({
      address: {
        hash: 'd1f0050454a27f025c6820fc4a42b101a7fa356a',
        subject: 'chore: trim verification',
        message: 'chore: trim verification\n\nwith a body',
      },
    });
    assert.match(html, /<span class="address-hash">d1f0050<\/span>/);
    assert.match(
      html,
      /<span class="address-text ">chore: trim verification<\/span>/,
    );
  });

  test('spins the fetch button while fetching', () => {
    assert.match(
      bar({ fetching: true }),
      /class="nav-button running"[^>]*disabled=""/,
    );
    assert.match(bar({}), /class="nav-button "[^>]*title="Fetch/);
  });
});

// The address bar's popup with this search, and what it looked up
const popup = (
  query: string,
  result?: Parameters<typeof LocationsPopup>[0]['lookup'],
) =>
  renderToStaticMarkup(
    <LocationsPopup
      repository={undefined}
      selected={undefined}
      anchor={{ current: null }}
      message={undefined}
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
    assert.match(html, /class="row hash-suggestion active"/);
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

suite('Menu items', () => {
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
    assert.match(html, /class="menu-separator"/);
    assert.match(html, /role="menuitem"[^>]*disabled=""/);
  });
});

suite('Placeholders', () => {
  test('draws grey bars in rows of the given kind', () => {
    const html = renderToStaticMarkup(
      <SkeletonRows count={3} className="diff-line" />,
    );
    assert.strictEqual(
      html.match(/class="diff-line skeleton-row"/g)?.length,
      3,
    );
    assert.match(html, /aria-busy="true"/);
  });

  test('stand in for a diff that loads, and a large file being fetched', () => {
    assert.deepStrictEqual(kinds(diffRows([], new Map(), undefined, true)), [
      'summary',
      'skeleton',
    ]);
    const large = {
      path: 'graph.json',
      binary: false,
      hunks: [],
      placeholder: { lines: 5000 },
    };
    // Collapsed with its size, then placeholders once opened until it loads
    assert.deepStrictEqual(kinds(diffRows([large], new Map(), undefined)), [
      'summary',
      'file',
      'large',
    ]);
    assert.deepStrictEqual(
      kinds(diffRows([large], new Map([['graph.json', true]]), undefined)),
      ['summary', 'file', 'skeletonLines'],
    );
  });

  test('shows a binary file as such, whole or in a diff', () => {
    assert.deepStrictEqual(
      kinds(
        diffRows([], new Map(), { path: 'a.png', content: '', binary: true }),
      ),
      ['summary', 'file', 'binary'],
    );
    const [binary] = parsePatch(
      [
        'diff --git a/a.png b/a.png',
        'index 1111111..2222222 100644',
        'Binary files a/a.png and b/a.png differ',
      ].join('\n'),
    );
    assert.deepStrictEqual(kinds(diffRows([binary], new Map(), undefined)), [
      'summary',
      'file',
      'binary',
    ]);
  });
});
