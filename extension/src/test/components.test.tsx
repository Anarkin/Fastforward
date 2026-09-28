import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FileChange } from '../protocol';
import { changesTreeElements, changesTreeRows } from '../webview/changesTree';
import { MenuItems } from '../webview/contextMenu';
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
