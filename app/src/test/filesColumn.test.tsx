import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { comparisonOf } from '../shared/comparisons';
import { workingTreeHash } from '../shared/protocol';
import {
  Files,
  filesCursor,
  filesTitle,
  noChangesText,
} from '../webview/filesColumn';
import type { Folders } from '../webview/viewFolders';
import type { ListedRows } from '../webview/virtualRows';
import { clickFile, type RowProps } from './componentFixtures';
import { fileChange as change, noop, renderedBy, tagWith } from './fixtures';

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

function changesRows(overrides: Partial<FilesProps>) {
  const column = renderedBy(Files, filesProps(overrides));
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

  test('shows no rows without changes, not even their header', () => {
    assert.deepStrictEqual(changesRows({}).rows, []);
  });

  test('scrolls All Changes into view when it is selected, as Home or Page Up may select it', () => {
    assert.strictEqual(
      changesRows({ files: [change('a.ts')] }).selectedKey,
      'changes',
    );
  });

  test('shows the staged and unstaged changes of the working tree in sections, with a file in both', () => {
    const picked: [string | undefined, string | undefined][] = [];
    const { keys, rows, selectedKey } = changesRows({
      files: [change('a.ts')],
      staged: [change('a.ts'), change('b.ts')],
      area: 'unstaged',
      onSelect: (path, area) => picked.push([path, area]),
    });
    assert.deepStrictEqual(keys, [
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
    assert.strictEqual(header(0), 'Staged');
    assert.strictEqual(header(3), 'Unstaged');
    rows[0].props.onClick();
    clickFile(rows[4]);
    assert.deepStrictEqual(picked, [
      [undefined, 'staged'],
      ['a.ts', 'unstaged'],
    ]);
  });

  test('deselects the selected file on a click, and selects another', () => {
    const picked: (string | undefined)[] = [];
    const { keys, rows, selectedKey } = changesRows({
      files: [change('a.ts'), change('b.ts')],
      selected: 'a.ts',
      onSelect: (path) => picked.push(path),
    });
    assert.strictEqual(selectedKey, 'file:a.ts');
    assert.deepStrictEqual(keys, ['changes', 'file:a.ts', 'file:b.ts']);
    clickFile(rows[1]);
    clickFile(rows[2]);
    assert.deepStrictEqual(picked, [undefined, 'b.ts']);
  });

  test('selects all changes with their header, marked while no file is, leaving them be when they are', () => {
    const picked: (string | undefined)[] = [];
    const [header] = changesRows({
      files: [change('a.ts')],
      onSelect: (path) => picked.push(path),
    }).rows;
    assert.match(header.props.className, /\bselected\b/);
    assert.strictEqual(
      renderToStaticMarkup(header),
      `<div class="${header.props.className}"><span class="path">All Changes</span></div>`,
    );
    header.props.onClick();
    assert.strictEqual(picked.length, 0);
    const [unmarked] = changesRows({
      files: [change('a.ts')],
      selected: 'a.ts',
      onSelect: (path) => picked.push(path),
    }).rows;
    assert.doesNotMatch(unmarked.props.className, /\bselected\b/);
    unmarked.props.onClick();
    assert.deepStrictEqual(picked, [undefined]);
  });
});
