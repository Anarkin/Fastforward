import * as assert from 'node:assert';
import {
  adjacentColumn,
  columnOf,
  columnStep,
  forwardedColumn,
  shownColumns,
} from '../webview/activeColumn';
import { changesTree, changesTreeRows, filesKey } from '../webview/changesTree';
import {
  changeScrollTop,
  changeStarts,
  diffRows,
  diffScrollLeft,
  diffScrollTop,
} from '../webview/diffView';
import { parsePatch } from '../webview/diff';
import { fullyVisible, moveInList } from '../webview/listMoves';
import { changeStep } from '../webview/shortcuts';
import { element, fileChange } from './fixtures';

const visible = { first: 0, last: 0 };

suite('Moving in a list', () => {
  test('steps, jumps to either end, and pages to the last row in view before a screen further', () => {
    const rows = { first: 10, last: 19 };
    assert.strictEqual(moveInList('ArrowDown', 3, 30, rows), 4);
    assert.strictEqual(moveInList('ArrowUp', 0, 30, rows), undefined);
    assert.strictEqual(moveInList('ArrowDown', undefined, 30, rows), 0);
    assert.strictEqual(moveInList('Home', 12, 30, rows), 0);
    assert.strictEqual(moveInList('End', 12, 30, rows), 29);
    assert.strictEqual(moveInList('PageDown', 12, 30, rows), 19);
    assert.strictEqual(moveInList('PageDown', 19, 30, rows), 28);
    assert.strictEqual(moveInList('PageDown', 28, 30, rows), 29);
    assert.strictEqual(moveInList('PageUp', 15, 30, rows), 10);
    assert.strictEqual(moveInList('PageUp', 10, 30, rows), 1);
    assert.strictEqual(moveInList('Enter', 3, 30, rows), undefined);
    assert.strictEqual(moveInList('End', undefined, 0, rows), undefined);
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

  test('moves to the next column on Right or Tab, and back on Left or Shift+Tab', () => {
    assert.strictEqual(columnStep(key), 1);
    assert.strictEqual(columnStep({ ...key, key: 'ArrowLeft' }), -1);
    assert.strictEqual(columnStep({ ...key, key: 'Tab' }), 1);
    assert.strictEqual(columnStep({ ...key, key: 'Tab', shiftKey: true }), -1);
  });

  test('leaves the arrows to fields and to keys a column used itself, and keys with modifiers alone', () => {
    assert.strictEqual(
      columnStep({ ...key, target: element('INPUT') }),
      undefined,
    );
    assert.strictEqual(
      columnStep({ ...key, target: element('DIV', true) }),
      undefined,
    );
    assert.strictEqual(
      columnStep({ ...key, key: 'Tab', target: element('INPUT') }),
      1,
    );
    assert.strictEqual(
      columnStep({ ...key, defaultPrevented: true }),
      undefined,
    );
    assert.strictEqual(columnStep({ ...key, ctrlKey: true }), undefined);
    assert.strictEqual(columnStep({ ...key, shiftKey: true }), undefined);
    assert.strictEqual(columnStep({ ...key, key: 'ArrowDown' }), undefined);
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

suite('Files column keys', () => {
  const files = [
    fileChange('src/app/a.ts'),
    fileChange('src/b.ts'),
    fileChange('c.ts'),
  ];
  const rows = (closed: string[] = []) =>
    changesTreeRows(changesTree(files), new Set(closed));

  test('moves through All Changes, the folders and the files, selecting the files it lands on', () => {
    assert.deepStrictEqual(
      filesKey('ArrowDown', rows(), true, 'changes', undefined, visible),
      { kind: 'cursor', key: 'folder:src' },
    );
    assert.deepStrictEqual(
      filesKey('End', rows(), true, 'changes', undefined, visible),
      {
        kind: 'select',
        key: 'file:c.ts',
        file: 'c.ts',
      },
    );
    assert.deepStrictEqual(
      filesKey('Home', rows(), true, 'file:c.ts', 'c.ts', visible),
      { kind: 'select', key: 'changes', file: undefined },
    );
    assert.deepStrictEqual(
      filesKey('ArrowUp', rows(), true, 'changes', undefined, visible),
      { kind: 'stay' },
    );
    assert.strictEqual(
      filesKey('Enter', rows(), true, 'changes', undefined, visible),
      undefined,
    );
  });

  test('selects the file or All Changes it lands on only when it is not selected already, so the diff is not loaded anew', () => {
    assert.deepStrictEqual(
      filesKey(
        'ArrowDown',
        rows(),
        true,
        'folder:src/app',
        'src/app/a.ts',
        visible,
      ),
      { kind: 'cursor', key: 'file:src/app/a.ts' },
    );
    assert.deepStrictEqual(
      filesKey(
        'ArrowDown',
        rows(),
        true,
        'folder:src/app',
        'src/b.ts',
        visible,
      ),
      { kind: 'select', key: 'file:src/app/a.ts', file: 'src/app/a.ts' },
    );
    assert.deepStrictEqual(
      filesKey('ArrowUp', rows(), true, 'folder:src', undefined, visible),
      { kind: 'cursor', key: 'changes' },
    );
  });

  test('opens or closes the folder under the cursor on Space, doing nothing else on a file', () => {
    assert.deepStrictEqual(
      filesKey(' ', rows(['src']), true, 'folder:src', undefined, visible),
      { kind: 'toggle', folder: 'src', changed: true },
    );
    assert.deepStrictEqual(
      filesKey(' ', rows(), true, 'folder:src/app', undefined, visible),
      { kind: 'toggle', folder: 'src/app', changed: true },
    );
    assert.deepStrictEqual(
      filesKey(' ', rows(), true, 'file:c.ts', 'c.ts', visible),
      {
        kind: 'stay',
      },
    );
  });

  test('leaves Left and Right to moving between the columns', () => {
    for (const cursor of ['folder:src', 'file:src/app/a.ts', 'changes']) {
      assert.strictEqual(
        filesKey('ArrowLeft', rows(), true, cursor, undefined, visible),
        undefined,
      );
      assert.strictEqual(
        filesKey('ArrowRight', rows(['src']), true, cursor, undefined, visible),
        undefined,
      );
    }
  });
});

suite('Diff keys', () => {
  test('scrolls back left with the left arrow while scrolled right, leaving it to move between the columns only then', () => {
    assert.strictEqual(diffScrollLeft('ArrowLeft', 100), 60);
    assert.strictEqual(diffScrollLeft('ArrowLeft', 20), 0);
    assert.strictEqual(diffScrollLeft('ArrowLeft', 0), undefined);
    assert.strictEqual(diffScrollLeft('ArrowRight', 100), undefined);
  });

  test('scrolls the sides of a side by side diff right with the right arrow too, no further than the widest line, as nothing else scrolls them', () => {
    assert.strictEqual(diffScrollLeft('ArrowRight', 0, 100), 40);
    assert.strictEqual(diffScrollLeft('ArrowRight', 80, 100), 100);
    assert.strictEqual(diffScrollLeft('ArrowRight', 100, 100), undefined);
    assert.strictEqual(diffScrollLeft('ArrowRight', 0, 0), undefined);
    assert.strictEqual(diffScrollLeft('ArrowLeft', 100, 100), 60);
  });

  test('scrolls three lines with the arrows, a screen less a line with the page keys, and to either end', () => {
    assert.strictEqual(diffScrollTop('ArrowDown', 100, 400, 2000), 166);
    assert.strictEqual(diffScrollTop('ArrowUp', 40, 400, 2000), 0);
    assert.strictEqual(diffScrollTop('PageDown', 100, 400, 2000), 478);
    assert.strictEqual(diffScrollTop('PageUp', 500, 400, 2000), 122);
    assert.strictEqual(diffScrollTop('Home', 500, 400, 2000), 0);
    assert.strictEqual(diffScrollTop('End', 0, 400, 2000), 1600);
    assert.strictEqual(diffScrollTop('End', 0, 400, 300), 0);
    assert.strictEqual(diffScrollTop('Enter', 0, 400, 2000), undefined);
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
    assert.strictEqual(changeStep({ key: 'j', code: 'KeyJ' }), 1);
    assert.strictEqual(changeStep({ key: 'k', code: 'KeyK' }), -1);
    assert.strictEqual(changeStep({ key: 'о', code: 'KeyJ' }), 1);
    assert.strictEqual(changeStep({ key: 'x', code: 'KeyX' }), undefined);
  });
});

suite('Changes from the Files column', () => {
  const key = {
    key: 'j',
    code: 'KeyJ',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
  };

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
