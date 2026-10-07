import * as assert from 'node:assert';
import {
  adjacentColumn,
  columnMove,
  columnOf,
  forwardedColumn,
  shownColumns,
} from '../webview/activeColumn';
import {
  changesTree,
  changesTreeRows,
  filesAncestors,
  filesKey,
  filesRows,
  listedFilesRows,
} from '../webview/changesTree';
import {
  changeScrollTop,
  changeStarts,
  diffRows,
  diffScrollLeft,
  diffScrollTop,
} from '../webview/diffView';
import { parsePatch } from '../webview/diff';
import { keymap } from '../shared/keymap';
import { fullyVisible, listMoveOf, moveInList } from '../webview/listMoves';
import { keyPressed } from '../webview/shortcuts';
import { element, fileChange } from './fixtures';

const visible = { first: 0, last: 0 };

const changeStep = (key: string, code: string) =>
  keyPressed(keymap.change, { ...press, key, code });

const press = {
  key: '',
  code: '',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: false,
  target: null,
};

suite('Moving in a list', () => {
  test('steps, jumps to either end, and pages to the last row in view before a screen further', () => {
    const rows = { first: 10, last: 19 };
    assert.strictEqual(moveInList('down', 3, 30, rows), 4);
    assert.strictEqual(moveInList('up', 0, 30, rows), undefined);
    assert.strictEqual(moveInList('down', undefined, 30, rows), 0);
    assert.strictEqual(moveInList('first', 12, 30, rows), 0);
    assert.strictEqual(moveInList('last', 12, 30, rows), 29);
    assert.strictEqual(moveInList('pageDown', 12, 30, rows), 19);
    assert.strictEqual(moveInList('pageDown', 19, 30, rows), 28);
    assert.strictEqual(moveInList('pageDown', 28, 30, rows), 29);
    assert.strictEqual(moveInList('pageUp', 15, 30, rows), 10);
    assert.strictEqual(moveInList('pageUp', 10, 30, rows), 1);
    assert.strictEqual(moveInList('last', undefined, 0, rows), undefined);
  });

  test('counts the rows wholly in view, leaving out ones cut off at either edge', () => {
    const rows = [0, 1, 2, 3, 4].map((index) => ({
      index,
      start: index * 40,
      end: (index + 1) * 40,
    }));
    assert.deepStrictEqual(fullyVisible(rows, 10, 100, 0), {
      first: 1,
      last: 1,
    });
    assert.deepStrictEqual(fullyVisible(rows, 0, 120, 1), {
      first: -1,
      last: 1,
    });
    assert.deepStrictEqual(fullyVisible([], 0, 100, 0), { first: 0, last: 0 });
  });
});

suite('Active column', () => {
  const key = {
    key: 'ArrowRight',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    target: element('DIV'),
  };

  test('shows the files and the diff only with a commit selected, and the commits unless hidden', () => {
    assert.deepStrictEqual(shownColumns(true, 'a'), [
      'commits',
      'files',
      'diff',
    ]);
    assert.deepStrictEqual(shownColumns(true, undefined), ['commits']);
    assert.deepStrictEqual(shownColumns(false, 'a'), ['files', 'diff']);
  });

  test('moves to the next column on Right or Tab, and back on Left or Shift+Tab, telling Tab apart', () => {
    assert.deepStrictEqual(columnMove(key), { step: 1, tab: false });
    assert.deepStrictEqual(columnMove({ ...key, key: 'ArrowLeft' }), {
      step: -1,
      tab: false,
    });
    assert.deepStrictEqual(columnMove({ ...key, key: 'Tab' }), {
      step: 1,
      tab: true,
    });
    assert.deepStrictEqual(columnMove({ ...key, key: 'Tab', shiftKey: true }), {
      step: -1,
      tab: true,
    });
  });

  test('leaves the arrows to fields and to keys a column used itself, and keys with modifiers alone', () => {
    assert.strictEqual(
      columnMove({ ...key, target: element('INPUT') })?.step,
      undefined,
    );
    assert.strictEqual(
      columnMove({ ...key, target: element('DIV', true) })?.step,
      undefined,
    );
    assert.strictEqual(
      columnMove({ ...key, key: 'Tab', target: element('INPUT') })?.step,
      1,
    );
    assert.strictEqual(
      columnMove({ ...key, defaultPrevented: true })?.step,
      undefined,
    );
    assert.strictEqual(columnMove({ ...key, ctrlKey: true })?.step, undefined);
    assert.strictEqual(columnMove({ ...key, shiftKey: true })?.step, undefined);
    assert.strictEqual(
      columnMove({ ...key, key: 'ArrowDown' })?.step,
      undefined,
    );
  });

  test('stops at the first and last shown column, starting from the first', () => {
    const all = shownColumns(true, 'a');
    assert.strictEqual(adjacentColumn(all, 'commits', 1), 'files');
    assert.strictEqual(adjacentColumn(all, 'diff', -1), 'files');
    assert.strictEqual(adjacentColumn(all, 'diff', 1), undefined);
    assert.strictEqual(adjacentColumn(all, 'commits', -1), undefined);
    assert.strictEqual(
      adjacentColumn(shownColumns(false, 'a'), 'commits', 1),
      'files',
    );
  });

  test('tells which column an element is in by its place among the columns', () => {
    const container: { children: unknown[] } = { children: [] };
    const columns = [0, 1, 2].map(() => ({ parentElement: container }));
    container.children = columns;
    const inColumn = (index: number) => ({ closest: () => columns[index] });
    assert.strictEqual(columnOf(inColumn(0)), 'commits');
    assert.strictEqual(columnOf(inColumn(1)), 'files');
    assert.strictEqual(columnOf(inColumn(2)), 'diff');
    assert.strictEqual(columnOf({ closest: () => null }), undefined);
    assert.strictEqual(columnOf(null), undefined);
  });
});

const at = (path: string) => ({ area: undefined, path });

const tree = (paths: string[]) =>
  changesTreeRows(
    changesTree(paths.map((path) => fileChange(path))),
    new Set(),
  );

suite('Files column keys', () => {
  const files = [
    fileChange('src/app/a.ts'),
    fileChange('src/b.ts'),
    fileChange('c.ts'),
  ];
  const rows = (closed: string[] = []) =>
    filesRows([
      {
        area: undefined,
        header: true,
        rows: changesTreeRows(changesTree(files), new Set(closed)),
      },
    ]);
  const none = { area: undefined, path: undefined };

  test('moves through All Changes, the folders and the files, selecting the files it lands on', () => {
    assert.deepStrictEqual(filesKey('down', rows(), 'changes', none, visible), {
      kind: 'cursor',
      key: 'folder:src',
    });
    assert.deepStrictEqual(filesKey('last', rows(), 'changes', none, visible), {
      kind: 'select',
      key: 'file:c.ts',
      area: undefined,
      file: 'c.ts',
    });
    assert.deepStrictEqual(
      filesKey('first', rows(), 'file:c.ts', at('c.ts'), visible),
      { kind: 'select', key: 'changes', area: undefined, file: undefined },
    );
    assert.deepStrictEqual(filesKey('up', rows(), 'changes', none, visible), {
      kind: 'stay',
    });
    assert.strictEqual(listMoveOf({ ...press, key: 'Enter' }), undefined);
  });

  test('selects the file or All Changes it lands on only when it is not selected already, so the diff is not loaded anew', () => {
    assert.deepStrictEqual(
      filesKey('down', rows(), 'folder:src/app', at('src/app/a.ts'), visible),
      { kind: 'cursor', key: 'file:src/app/a.ts' },
    );
    assert.deepStrictEqual(
      filesKey('down', rows(), 'folder:src/app', at('src/b.ts'), visible),
      {
        kind: 'select',
        key: 'file:src/app/a.ts',
        area: undefined,
        file: 'src/app/a.ts',
      },
    );
    assert.deepStrictEqual(
      filesKey('up', rows(), 'folder:src', none, visible),
      { kind: 'cursor', key: 'changes' },
    );
  });

  test('opens or closes the folder under the cursor on Space, doing nothing else on a file', () => {
    assert.deepStrictEqual(
      filesKey('folder', rows(['src']), 'folder:src', none, visible),
      { kind: 'toggle', area: undefined, folder: 'src', changed: true },
    );
    assert.deepStrictEqual(
      filesKey('folder', rows(), 'folder:src/app', none, visible),
      { kind: 'toggle', area: undefined, folder: 'src/app', changed: true },
    );
    assert.deepStrictEqual(
      filesKey('folder', rows(), 'file:c.ts', at('c.ts'), visible),
      { kind: 'stay' },
    );
  });

  test('moves from the staged changes on into the unstaged ones, keying a file in both apart and its folders by their side', () => {
    const sections = filesRows([
      { area: 'staged', header: true, rows: tree(['a.ts']) },
      { area: 'unstaged', header: true, rows: tree(['a.ts', 'src/b.ts']) },
    ]);
    const listed = listedFilesRows(sections);
    assert.deepStrictEqual(
      Array.from({ length: listed.count }, (_, index) => listed.keyOf(index)),
      [
        'staged:changes',
        'staged:file:a.ts',
        'unstaged:changes',
        'unstaged:folder:src',
        'unstaged:file:src/b.ts',
        'unstaged:file:a.ts',
      ],
    );
    assert.deepStrictEqual(
      filesKey(
        'down',
        sections,
        'staged:file:a.ts',
        { area: 'staged', path: 'a.ts' },
        visible,
      ),
      {
        kind: 'select',
        key: 'unstaged:changes',
        area: 'unstaged',
        file: undefined,
      },
    );
    assert.deepStrictEqual(
      filesKey(
        'last',
        sections,
        'staged:changes',
        { area: 'staged', path: undefined },
        visible,
      ),
      {
        kind: 'select',
        key: 'unstaged:file:a.ts',
        area: 'unstaged',
        file: 'a.ts',
      },
    );
    assert.deepStrictEqual(
      filesKey(
        'folder',
        sections,
        'unstaged:folder:src',
        { area: 'staged', path: undefined },
        visible,
      ),
      { kind: 'toggle', area: 'unstaged', folder: 'src', changed: true },
    );
    assert.deepStrictEqual(filesAncestors(sections, 4), [3]);
  });

  test('leaves Left and Right to moving between the columns', () => {
    for (const cursor of ['folder:src', 'file:src/app/a.ts', 'changes']) {
      for (const key of ['ArrowLeft', 'ArrowRight']) {
        assert.strictEqual(listMoveOf({ ...press, key }), undefined, cursor);
      }
    }
  });
});

suite('Diff keys', () => {
  test('scrolls back left with the left arrow while scrolled right, leaving it to move between the columns only then', () => {
    assert.strictEqual(diffScrollLeft(-1, 100), 60);
    assert.strictEqual(diffScrollLeft(-1, 20), 0);
    assert.strictEqual(diffScrollLeft(-1, 0), undefined);
    assert.strictEqual(diffScrollLeft(1, 100), undefined);
  });

  test('scrolls the sides of a side by side diff right with the right arrow too, no further than the widest line, as nothing else scrolls them', () => {
    assert.strictEqual(diffScrollLeft(1, 0, 100), 40);
    assert.strictEqual(diffScrollLeft(1, 80, 100), 100);
    assert.strictEqual(diffScrollLeft(1, 100, 100), undefined);
    assert.strictEqual(diffScrollLeft(1, 0, 0), undefined);
    assert.strictEqual(diffScrollLeft(-1, 100, 100), 60);
  });

  test('scrolls three lines with the arrows, a screen less a line with the page keys, and to either end', () => {
    assert.strictEqual(diffScrollTop('down', 100, 400, 2000), 166);
    assert.strictEqual(diffScrollTop('up', 40, 400, 2000), 0);
    assert.strictEqual(diffScrollTop('pageDown', 100, 400, 2000), 478);
    assert.strictEqual(diffScrollTop('pageUp', 500, 400, 2000), 122);
    assert.strictEqual(diffScrollTop('first', 500, 400, 2000), 0);
    assert.strictEqual(diffScrollTop('last', 0, 400, 2000), 1600);
    assert.strictEqual(diffScrollTop('last', 0, 400, 300), 0);
  });
});

suite('Jumping between changes', () => {
  test('finds where each run of added or removed lines starts', () => {
    const rows = diffRows(
      parsePatch(
        [
          'diff --git a/a.ts b/a.ts',
          '--- a/a.ts',
          '+++ b/a.ts',
          '@@ -1,6 +1,6 @@',
          ' one',
          '-two',
          '+2',
          ' three',
          ' four',
          '+five',
          '',
        ].join('\n'),
      ),
      new Map(),
      undefined,
    );
    assert.deepStrictEqual(
      changeStarts(rows).map((index) => rows[index]),
      [
        {
          kind: 'line',
          file: 0,
          line: {
            kind: 'removed',
            oldNumber: 2,
            newNumber: undefined,
            text: 'two',
          },
        },
        {
          kind: 'line',
          file: 0,
          line: {
            kind: 'added',
            oldNumber: undefined,
            newNumber: 5,
            text: 'five',
          },
        },
      ],
    );
  });

  test('scrolls to the next or previous change below the header and some context, and no further at either end', () => {
    const starts = [100, 500, 900];
    assert.strictEqual(changeScrollTop(starts, 0, 1, 60), 40);
    assert.strictEqual(changeScrollTop(starts, 40, 1, 60), 440);
    assert.strictEqual(changeScrollTop(starts, 440, -1, 60), 40);
    assert.strictEqual(changeScrollTop(starts, 40, -1, 60), undefined);
    assert.strictEqual(changeScrollTop(starts, 840, 1, 60), undefined);
    assert.strictEqual(changeScrollTop([30], 100, -1, 60), 0);
  });

  test('takes j and k, whatever the keyboard layout', () => {
    assert.strictEqual(changeStep('j', 'KeyJ'), 1);
    assert.strictEqual(changeStep('k', 'KeyK'), -1);
    assert.strictEqual(changeStep('о', 'KeyJ'), 1);
    assert.strictEqual(changeStep('x', 'KeyX'), undefined);
  });
});

suite('Changes from the Files column', () => {
  const key = { ...press, key: 'j', code: 'KeyJ' };

  test('hands j and k in the Files column to the diff, to jump there', () => {
    assert.strictEqual(forwardedColumn('files', key), 'diff');
    assert.strictEqual(
      forwardedColumn('files', { ...key, key: 'k', code: 'KeyK' }),
      'diff',
    );
  });

  test('keeps them where they are elsewhere, and other keys or ones with modifiers in the Files column', () => {
    assert.strictEqual(forwardedColumn('commits', key), undefined);
    assert.strictEqual(forwardedColumn('diff', key), undefined);
    assert.strictEqual(forwardedColumn(undefined, key), undefined);
    assert.strictEqual(
      forwardedColumn('files', { ...key, key: 'x', code: 'KeyX' }),
      undefined,
    );
    assert.strictEqual(
      forwardedColumn('files', { ...key, ctrlKey: true }),
      undefined,
    );
    assert.strictEqual(
      forwardedColumn('files', { ...key, defaultPrevented: true }),
      undefined,
    );
  });
});
