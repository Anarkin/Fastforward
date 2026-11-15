import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { plainFilter } from '../../../../helpers/filters';
import {
  duplicateRows,
  filteredRows,
} from '../../../../../tools/commander/page/shownRows';
import { rowsOf } from '../../../../../tools/commander/page/listing';
import type { Sort } from '../../../../../tools/commander/shared/sorts';
import { entry, filterRow } from './listingFixtures';

suite('Filtering the rows of a side', () => {
  const rows = ['..', 'Report-Q3-2024.xlsx', 'notes.txt', 'report.md'].map(
    filterRow,
  );

  test('keeps the parent row and the rows whose name holds every word, anywhere and ignoring case', () => {
    assert.deepStrictEqual(
      filteredRows(rows, plainFilter('rep 2024')).map((each) => each.key),
      ['..', 'Report-Q3-2024.xlsx'],
    );
    assert.deepStrictEqual(
      filteredRows(rows, plainFilter('REPORT')).map((each) => each.key),
      ['..', 'Report-Q3-2024.xlsx', 'report.md'],
    );
    assert.strictEqual(filteredRows(rows, plainFilter('')), rows);
  });
});

suite('Showing the duplicates of a side', () => {
  const byName: Sort = {
    column: 'name',
    descending: false,
    groupByColor: false,
  };
  const rows = rowsOf(
    ['a.txt', 'b.txt', 'c.txt', 'd.txt', 'e.txt', 'f.txt', 'g.txt'].map(
      (name) => entry(name),
    ),
    true,
    true,
    byName,
  );

  test('keeps the parent folder and the files that have a copy, each group where its first file stands in the order of the side and its files in that order, setting the first file of each group apart', () => {
    const shown = duplicateRows(rows, [
      ['e.txt', 'b.txt'],
      ['f.txt', 'a.txt', 'd.txt'],
    ]);

    assert.deepStrictEqual(
      shown.rows.map((row) => row.key),
      ['..', 'a.txt', 'd.txt', 'f.txt', 'b.txt', 'e.txt'],
    );
    assert.deepStrictEqual([...shown.starts], ['a.txt', 'b.txt']);
  });

  test('leaves out a group of which the side shows fewer than two files, as one filtered out or hidden', () => {
    const shown = duplicateRows(rows, [
      ['c.txt', 'gone.txt'],
      ['g.txt', 'b.txt'],
    ]);

    assert.deepStrictEqual(
      shown.rows.map((row) => row.key),
      ['..', 'b.txt', 'g.txt'],
    );
    assert.deepStrictEqual([...shown.starts], ['b.txt']);
  });
});
