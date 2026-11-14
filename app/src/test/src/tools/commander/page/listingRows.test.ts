import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  rowsOf,
  filteredRows,
  filteredSelection,
  duplicateRows,
  flatRowOf,
  keysMatching,
  patternMatcher,
} from '../../../../../tools/commander/page/listing';
import type { Sort } from '../../../../../tools/commander/shared/settings';
import { entry, folder } from './listingFixtures';

const filterRow = (key: string) => ({
  key,
  entry:
    key === '..'
      ? undefined
      : {
          name: key,
          folder: false,
          link: false,
          hidden: false,
          size: 1,
          modified: 0,
        },
  base: key,
  extension: '',
  repository: false,
});
suite('Filtering the rows of a side', () => {
  const rows = ['..', 'Report-Q3-2024.xlsx', 'notes.txt', 'report.md'].map(
    filterRow,
  );

  test('keeps the parent row and the rows whose name holds every word, anywhere and ignoring case', () => {
    assert.deepStrictEqual(
      filteredRows(rows, ['rep', '2024']).map((each) => each.key),
      ['..', 'Report-Q3-2024.xlsx'],
    );
    assert.deepStrictEqual(
      filteredRows(rows, ['REPORT']).map((each) => each.key),
      ['..', 'Report-Q3-2024.xlsx', 'report.md'],
    );
    assert.strictEqual(filteredRows(rows, []), rows);
  });

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

const matching = (pattern: string, platform: string) => {
  const matches = patternMatcher(pattern, platform);
  return [
    'photo.jpg',
    'Photo.JPG',
    'photo.jpeg',
    'a.png',
    'ab.png',
    'notes.txt',
  ].filter((name) => matches(name));
};

suite('Marking the rows of a side by a pattern', () => {
  test('takes the names a pattern matches, * for any characters and ? for one, several patterns apart by semicolons, ignoring case on Windows and macOS as their file systems do', () => {
    assert.deepStrictEqual(matching('*.jpg', 'linux'), ['photo.jpg']);
    assert.deepStrictEqual(matching('*.jpg', 'win32'), [
      'photo.jpg',
      'Photo.JPG',
    ]);
    assert.deepStrictEqual(matching('?.png; *.jpeg', 'darwin'), [
      'photo.jpeg',
      'a.png',
    ]);
    assert.deepStrictEqual(matching('notes.txt', 'linux'), ['notes.txt']);
    assert.deepStrictEqual(matching('*', 'linux').length, 6);
    assert.deepStrictEqual(matching(' ; ', 'linux'), []);
    assert.deepStrictEqual(matching('(a).png', 'linux'), []);
  });

  test('gives the keys of the rows whose names a pattern matches, folders too, a file shown flat by its name alone, and never the parent folder', () => {
    const rows = [
      ...rowsOf(
        [entry('a.jpg'), entry('b.png'), folder('album.jpg'), folder('docs')],
        true,
        true,
        { column: 'name', descending: false, groupByColor: false },
      ),
      flatRowOf(entry('c.jpg'), 'sub\\'),
    ];

    assert.deepStrictEqual(keysMatching(rows, '*.jpg', 'win32'), [
      'album.jpg',
      'a.jpg',
      'sub\\c.jpg',
    ]);
    assert.deepStrictEqual(
      keysMatching(rows, '*', 'win32').includes('..'),
      false,
    );
  });
});
