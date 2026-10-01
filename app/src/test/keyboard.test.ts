import * as assert from 'node:assert';
import {
  adjacentColumn,
  columnOf,
  columnStep,
  shownColumns,
} from '../webview/activeColumn';
import { changesTreeRows, filesKey } from '../webview/changesTree';
import { diffScrollTop } from '../webview/diffView';
import { fullyVisible, moveInList } from '../webview/listMoves';
import { fileChange } from './fixtures';

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
    target: { tagName: 'DIV' },
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
      columnStep({ ...key, target: { tagName: 'INPUT' } }),
      undefined,
    );
    assert.strictEqual(
      columnStep({ ...key, key: 'Tab', target: { tagName: 'INPUT' } }),
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
    changesTreeRows(files, new Set(closed));

  test('moves through All Changes, the folders and the files, selecting the files it lands on', () => {
    assert.deepStrictEqual(
      filesKey('ArrowDown', rows(), true, 'changes', visible),
      { kind: 'cursor', key: 'folder:src' },
    );
    assert.deepStrictEqual(filesKey('End', rows(), true, 'changes', visible), {
      kind: 'cursor',
      key: 'file:c.ts',
      file: 'c.ts',
    });
    assert.deepStrictEqual(
      filesKey('Home', rows(), true, 'file:c.ts', visible),
      { kind: 'cursor', key: 'changes', file: undefined },
    );
    assert.deepStrictEqual(
      filesKey('ArrowUp', rows(), true, 'changes', visible),
      { kind: 'stay' },
    );
    assert.strictEqual(
      filesKey('Enter', rows(), true, 'changes', visible),
      undefined,
    );
  });

  test('opens a closed folder on Right, and leaves Right on anything else to the next column', () => {
    assert.deepStrictEqual(
      filesKey('ArrowRight', rows(['src']), true, 'folder:src', visible),
      { kind: 'toggle', folder: 'src', changed: true },
    );
    assert.strictEqual(
      filesKey('ArrowRight', rows(), true, 'folder:src', visible),
      undefined,
    );
    assert.strictEqual(
      filesKey('ArrowRight', rows(), true, 'file:c.ts', visible),
      undefined,
    );
  });

  test('closes an open folder on Left, then goes to its parent, and leaves Left at the top to the previous column', () => {
    assert.deepStrictEqual(
      filesKey('ArrowLeft', rows(), true, 'folder:src/app', visible),
      { kind: 'toggle', folder: 'src/app', changed: true },
    );
    assert.deepStrictEqual(
      filesKey('ArrowLeft', rows(), true, 'file:src/app/a.ts', visible),
      { kind: 'cursor', key: 'folder:src/app' },
    );
    assert.deepStrictEqual(
      filesKey('ArrowLeft', rows(['src/app']), true, 'folder:src/app', visible),
      { kind: 'cursor', key: 'folder:src' },
    );
    assert.strictEqual(
      filesKey('ArrowLeft', rows(['src']), true, 'folder:src', visible),
      undefined,
    );
    assert.strictEqual(
      filesKey('ArrowLeft', rows(), true, 'file:c.ts', visible),
      undefined,
    );
    assert.strictEqual(
      filesKey('ArrowLeft', rows(), true, 'changes', visible),
      undefined,
    );
  });
});

suite('Diff keys', () => {
  test('scrolls three lines with the arrows, a screen less a line with the page keys, and to either end', () => {
    assert.strictEqual(diffScrollTop('ArrowDown', 100, 400, 2000), 160);
    assert.strictEqual(diffScrollTop('ArrowUp', 40, 400, 2000), 0);
    assert.strictEqual(diffScrollTop('PageDown', 100, 400, 2000), 480);
    assert.strictEqual(diffScrollTop('PageUp', 500, 400, 2000), 120);
    assert.strictEqual(diffScrollTop('Home', 500, 400, 2000), 0);
    assert.strictEqual(diffScrollTop('End', 0, 400, 2000), 1600);
    assert.strictEqual(diffScrollTop('End', 0, 400, 300), 0);
    assert.strictEqual(diffScrollTop('Enter', 0, 400, 2000), undefined);
  });
});
