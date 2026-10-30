import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { formatSize } from '../../../../tools/commander/page/format';
import {
  nameParts,
  nextSort,
  opens,
  rowsOf,
  selectionAfter,
} from '../../../../tools/commander/page/listing';
import type { Sort } from '../../../../tools/commander/shared/settings';
import type { Entry } from '../../../../tools/commander/shared/protocol';

const entry = (name: string, extra: Partial<Entry> = {}): Entry => ({
  name,
  folder: false,
  link: false,
  hidden: false,
  size: 0,
  modified: 0,
  ...extra,
});

const folder = (name: string, extra: Partial<Entry> = {}): Entry =>
  entry(name, { folder: true, size: undefined, ...extra });

const defaultSort: Sort = { column: 'extension', descending: false };

const keys = (
  entries: readonly Entry[],
  sort: Sort = defaultSort,
  { parent = false, hidden = true } = {},
) => rowsOf(entries, parent, hidden, sort).map((row) => row.key);

suite('Commander listing', () => {
  test('splits a file name at its last dot, but not a leading one or a folder name', () => {
    assert.deepStrictEqual(nameParts(entry('notepad.exe')), {
      base: 'notepad',
      extension: 'exe',
    });
    assert.deepStrictEqual(nameParts(entry('archive.tar.gz')), {
      base: 'archive.tar',
      extension: 'gz',
    });
    assert.deepStrictEqual(nameParts(entry('.gitignore')), {
      base: '.gitignore',
      extension: '',
    });
    assert.deepStrictEqual(nameParts(entry('Makefile')), {
      base: 'Makefile',
      extension: '',
    });
    assert.deepStrictEqual(nameParts(folder('node.js')), {
      base: 'node.js',
      extension: '',
    });
  });

  test('lists the parent first, then the folders by name, then the files by extension, by default', () => {
    assert.deepStrictEqual(
      keys(
        [
          entry('b.txt'),
          folder('src'),
          entry('a.zip'),
          entry('README'),
          folder('build'),
          entry('a.txt'),
        ],
        defaultSort,
        { parent: true },
      ),
      ['..', 'build', 'src', 'README', 'a.txt', 'b.txt', 'a.zip'],
    );
  });

  test('sorts names ignoring case and reading numbers whole', () => {
    assert.deepStrictEqual(
      keys([entry('file10.txt'), entry('File2.txt'), entry('file1.txt')], {
        column: 'name',
        descending: false,
      }),
      ['file1.txt', 'File2.txt', 'file10.txt'],
    );
  });

  test('sorts by size or date with the folders still first, and reverses within each', () => {
    const entries = [
      entry('big.bin', { size: 300, modified: 1 }),
      entry('small.bin', { size: 1, modified: 3 }),
      folder('old', { modified: 1 }),
      folder('new', { modified: 2 }),
    ];
    assert.deepStrictEqual(
      keys(entries, { column: 'size', descending: false }),
      ['new', 'old', 'small.bin', 'big.bin'],
    );
    assert.deepStrictEqual(
      keys(entries, { column: 'date', descending: true }, { parent: true }),
      ['..', 'new', 'old', 'small.bin', 'big.bin'],
    );
  });

  test('leaves out the hidden files and folders when they are not shown', () => {
    assert.deepStrictEqual(
      keys(
        [
          entry('pagefile.sys', { hidden: true }),
          folder('.git', { hidden: true }),
          entry('notes.txt'),
        ],
        defaultSort,
        { hidden: false },
      ),
      ['notes.txt'],
    );
  });

  test('sorts by another column ascending, and by the same one again the other way', () => {
    assert.deepStrictEqual(nextSort(defaultSort, 'name'), {
      column: 'name',
      descending: false,
    });
    assert.deepStrictEqual(nextSort(defaultSort, 'extension'), {
      column: 'extension',
      descending: true,
    });
  });

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

  test('opens the parent and folders, not files', () => {
    const [parent, src, file] = rowsOf(
      [folder('src'), entry('a.txt')],
      true,
      true,
      defaultSort,
    );
    assert.deepStrictEqual(
      [opens(parent), opens(src), opens(file), opens(undefined)],
      [true, true, false, false],
    );
  });

  test('writes sizes in bytes with thousands grouped, and none for a folder', () => {
    assert.strictEqual(formatSize(12_288), '12,288');
    assert.strictEqual(formatSize(1_007_528), '1,007,528');
    assert.strictEqual(formatSize(0), '0');
    assert.strictEqual(formatSize(undefined), '');
  });
});
