import * as assert from 'node:assert';
import { isValidElement } from 'react';
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
import { fileRowKey } from '../../../../../tools/git/page/treeLayout';
import { FileRow } from '../../../../../tools/git/page/tree';
import { clickRow } from '../../../../helpers/componentFixtures';
import { noop } from '../../../../helpers/fixtures';
import { classesOf, tagsWith, tagWith } from '../../../../helpers/markup';
import { fileChange } from '../../../../helpers/gitValues';

const changesTreeElements = ({
  rows,
  ...options
}: { rows: readonly ChangesTreeRow[] } & Omit<
  React.ComponentProps<typeof ChangesTreeItem>,
  'row'
>) => rows.map((row) => ChangesTreeItem({ row, ...options }));

suite('Changes tree rows', () => {
  test('draws folders and files, marking the selected file', () => {
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
    tagWith(html, 'title="src"', 'row', 'tree-row', 'folder', 'dimmed');
    tagWith(html, 'title="Modified: src/b.ts"', 'row', 'file', 'selected');
    const a = tagWith(html, 'title="Modified: src/a.ts"', 'row', 'file');
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
      /<span class="path"><mark class="match">deal<\/mark>s<\/span>/,
    );
    assert.match(
      html,
      /<span class="path"><mark class="match">deal<\/mark>View\.ts<\/span>/,
    );
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
    tagWith(html, 'title="src"', 'row', 'folder', 'selected');
    const a = tagWith(html, 'title="Modified: src/a.ts"', 'row', 'file');
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
