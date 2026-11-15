import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { rowsOf } from '../../../../../tools/commander/page/listing';
import {
  filteredSelection,
  selectionAfter,
} from '../../../../../tools/commander/page/rowSelection';
import { filteredRows } from '../../../../../tools/commander/page/shownRows';
import { defaultSort, entry, filterRow, folder } from './listingFixtures';

suite('Commander row selection', () => {
  test('selects what a listing names, as the folder gone up from, or else the first row of a new folder', () => {
    const rows = rowsOf(
      [folder('src'), entry('a.txt')],
      true,
      true,
      defaultSort,
    );
    assert.strictEqual(selectionAfter(undefined, '/work', rows, 'src'), 'src');
    assert.strictEqual(
      selectionAfter(
        { folder: '/old', key: 'a.txt', index: 2 },
        '/work',
        rows,
        undefined,
      ),
      '..',
    );
  });

  test('selects the first row once files come to a side of the same folder that had none, as a root of an empty drive has no parent row, rather than the last', () => {
    const rows = rowsOf(
      [entry('a.txt'), entry('b.txt'), entry('c.txt')],
      false,
      true,
      defaultSort,
    );
    assert.strictEqual(
      selectionAfter(
        { folder: '/', key: undefined, index: -1 },
        '/',
        rows,
        undefined,
      ),
      rows[0]?.key,
    );
  });

  test('keeps the selected row when its folder is listed again, or the row now in its place when it is gone', () => {
    const rows = rowsOf(
      [folder('src'), entry('a.txt')],
      true,
      true,
      defaultSort,
    );
    assert.strictEqual(
      selectionAfter(
        { folder: '/work', key: 'a.txt', index: 2 },
        '/work',
        rows,
        undefined,
      ),
      'a.txt',
    );
    assert.strictEqual(
      selectionAfter(
        { folder: '/work', key: 'b.txt', index: 1 },
        '/work',
        rows,
        undefined,
      ),
      'src',
    );
    assert.strictEqual(
      selectionAfter(
        { folder: '/work', key: 'z.txt', index: 9 },
        '/work',
        rows,
        undefined,
      ),
      'a.txt',
    );
  });
});

suite('Filtering the rows of a side', () => {
  const rows = ['..', 'Report-Q3-2024.xlsx', 'notes.txt', 'report.md'].map(
    filterRow,
  );

  test('keeps the selected row once filtered if it matches, else selects the first match, the parent row only when nothing matches', () => {
    const shown = filteredRows(rows, ['report']);
    assert.strictEqual(filteredSelection(shown, 'report.md'), 'report.md');
    assert.strictEqual(filteredSelection(shown, '..'), 'Report-Q3-2024.xlsx');
    assert.strictEqual(
      filteredSelection(shown, 'notes.txt'),
      'Report-Q3-2024.xlsx',
    );
    assert.strictEqual(
      filteredSelection(filteredRows(rows, ['nothing']), 'notes.txt'),
      '..',
    );
    assert.strictEqual(filteredSelection([], 'notes.txt'), undefined);
  });
});
