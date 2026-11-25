import * as assert from 'node:assert';
import { act, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { plainFilter } from '../../../../helpers/filters';
import {
  changesTree,
  changesTreeRows,
  folderRowKey,
  type ChangesTreeRow,
} from '../../../../../tools/git/page/changesRows';
import { ChangesTreeItem } from '../../../../../tools/git/page/changesTree';
import { fileRowKey } from '../../../../../lib/page/treeLayout';
import { FileRow } from '../../../../../lib/page/tree';
import { clickRow } from '../../../../helpers/componentFixtures';
import { noop } from '../../../../helpers/fixtures';
import { classesOf, tagsWith, tagWith } from '../../../../helpers/markup';
import { fileChange } from '../../../../helpers/gitValues';
import { knownWith, PathLooksContext } from '../../../../../lib/page/pathLooks';
import { noFileColors } from '../../../../../lib/page/fileColors';
import { PathMenuContext } from '../../../../../lib/page/pathMenu';
import { mounted } from '../../../../helpers/mounted';

const changesTreeElements = ({
  rows,
  ...options
}: { rows: readonly ChangesTreeRow[] } & Omit<
  React.ComponentProps<typeof ChangesTreeItem>,
  'row'
>) => rows.map((row) => ChangesTreeItem({ row, ...options }));

suite('Changes tree rows', () => {
  test('draws folders and files, a folder no dimmer than a file, marking the selected file', () => {
    const changes = [fileChange('src/a.ts'), fileChange('src/b.ts')];
    const html = renderToStaticMarkup(
      <>
        {changesTreeElements({
          rows: changesTreeRows(changesTree(changes), new Set()),
          showsAll: false,
          onToggle: noop,
          selected: 'src/b.ts',
          onSelect: noop,
          cursor: fileRowKey('src/b.ts'),
        })}
      </>,
    );
    const src = tagWith(html, 'data-tip="src"', 'row', 'tree-row', 'folder');
    assert.ok(!classesOf(src).has('dimmed'));
    tagWith(html, 'data-tip="src/b.ts"', 'row', 'file', 'selected');
    const a = tagWith(html, 'data-tip="src/a.ts"', 'row', 'file');
    assert.ok(!classesOf(a).has('selected'));
  });

  test('marks what the file search found in the names of folders and files', () => {
    const html = renderToStaticMarkup(
      <>
        {changesTreeElements({
          rows: changesTreeRows(
            changesTree([fileChange('deals/dealView.ts')]),
            new Set(),
          ),
          showsAll: false,
          onToggle: noop,
          selected: undefined,
          onSelect: noop,
          cursor: undefined,
          filter: plainFilter('deal'),
        })}
      </>,
    );
    assert.match(
      html,
      /<span class="path path-cut"><span class="path-piece"><span class="path-part"><mark class="match">deal<\/mark>s<\/span><\/span><\/span>/,
    );
    assert.match(
      html,
      /<span class="path path-cut"><span class="path-piece"><span class="path-part"><mark class="match">deal<\/mark>View\.ts<\/span><\/span><\/span>/,
    );
  });

  test('draws each folder of a row that merges folders as a part of its own, as a path, asking the looks of a part in the folder of its worktree', () => {
    const folder = { hidden: false, file: false, executable: false };
    const known = knownWith(new Map(), [
      {
        path: '/repo/src/test/a.ts',
        parts: [
          folder,
          folder,
          folder,
          { ...folder, hidden: true },
          { hidden: false, file: true, executable: false },
        ],
      },
    ]);
    const html = renderToStaticMarkup(
      <PathLooksContext
        value={{
          subscribe: () => () => {},
          fileColors: () => noFileColors,
          known: () => known,
          ask: noop,
          know: noop,
          dotHides: () => false,
        }}
      >
        {changesTreeElements({
          rows: changesTreeRows(
            changesTree([fileChange('src/test/a.ts')]),
            new Set(),
          ),
          root: '/repo',
          showsAll: false,
          onToggle: noop,
          selected: undefined,
          onSelect: noop,
          cursor: undefined,
        })}
      </PathLooksContext>,
    );
    assert.match(
      html,
      /<span class="path path-cut hidden"><span class="path-piece"><span class="path-part">src<\/span>\/<\/span><span class="path-piece"><span class="path-part hidden">test<\/span><\/span><\/span>/,
    );
    assert.match(
      html,
      /<span class="path path-cut"><span class="path-piece"><span class="path-part">a\.ts<\/span><\/span><\/span>/,
    );
  });

  test('names the folders and files of its rows by their whole paths, in the separators of the folder of the worktree', async () => {
    const asked: string[] = [];
    await mounted(
      <PathMenuContext value={(ask) => asked.push(ask.path)}>
        {changesTreeElements({
          rows: changesTreeRows(
            changesTree([fileChange('src/test/a.ts')]),
            new Set(),
          ),
          root: 'C:\\repo',
          showsAll: false,
          onToggle: noop,
          selected: undefined,
          onSelect: noop,
          cursor: undefined,
        })}
      </PathMenuContext>,
      (main, window) => {
        act(() => {
          for (const part of main.querySelectorAll('.path-part')) {
            part.dispatchEvent(
              new window.MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                button: 2,
              }),
            );
          }
        });
      },
    );
    assert.deepStrictEqual(asked, [
      'C:\\repo\\src',
      'C:\\repo\\src\\test',
      'C:\\repo\\src\\test\\a.ts',
    ]);
  });

  test('marks the row under the cursor, still deselecting the selected file on a click', () => {
    const picked: (string | undefined)[] = [];
    const elements = changesTreeElements({
      rows: changesTreeRows(changesTree([fileChange('src/a.ts')]), new Set()),
      showsAll: false,
      onToggle: noop,
      selected: 'src/a.ts',
      onSelect: (path) => picked.push(path),
      cursor: folderRowKey('src'),
    });
    const html = renderToStaticMarkup(<>{elements}</>);
    tagWith(html, 'data-tip="src"', 'row', 'folder', 'selected');
    const a = tagWith(html, 'data-tip="src/a.ts"', 'row', 'file');
    assert.ok(!classesOf(a).has('selected'));
    clickRow(elements[1], FileRow);
    assert.deepStrictEqual(picked, [undefined]);
  });

  test('showing all files, dims the folders and files without changes, and toggles each kind of folder its own way', () => {
    const toggled: string[] = [];
    const elements = changesTreeElements({
      rows: changesTreeRows(
        changesTree(
          [fileChange('src/lib/a.ts')],
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
      const row = tagWith(html, `data-tip="${title}"`, 'row', 'folder');
      assert.ok(!classesOf(row).has('dimmed'), title);
    }
    tagWith(html, 'data-tip="docs"', 'row', 'folder', 'dimmed');
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
