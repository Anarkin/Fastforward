import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { nameParts, rowsOf } from '../../../../../tools/commander/page/listing';
import { fileColorsOf } from '../../../../../lib/page/fileColors';
import type { Sort } from '../../../../../tools/commander/shared/sorts';
import type { Entry } from '../../../../../tools/commander/shared/protocol';
import { defaultSort, entry, folder } from './listingFixtures';

const keys = (
  entries: readonly Entry[],
  sort: Sort = defaultSort,
  { parent = false, hidden = true, groups = fileColorsOf([]) } = {},
) =>
  rowsOf(entries, parent, hidden, sort, undefined, groups).map(
    (row) => row.key,
  );

const colors = { light: '#000', dark: '#fff' };

const groups = fileColorsOf([
  { extensions: ['exe', '.COM'], colors },
  { extensions: ['md', 'txt', 'exe'], colors },
  { extensions: ['png'], colors },
]);

const grouped = [
  entry('b.txt', { size: 2 }),
  entry('a.png', { size: 1 }),
  folder('src'),
  entry('z.exe', { size: 1 }),
  entry('c.md', { size: 1 }),
  entry('README', { size: 9 }),
  entry('y.com', { size: 2 }),
  entry('d.zip', { size: 3 }),
  entry('IMAGE.PNG', { size: 5 }),
];

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
        groupByColor: false,
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
      keys(entries, { column: 'size', descending: false, groupByColor: false }),
      ['new', 'old', 'small.bin', 'big.bin'],
    );
    assert.deepStrictEqual(
      keys(
        entries,
        { column: 'date', descending: true, groupByColor: false },
        { parent: true },
      ),
      ['..', 'new', 'old', 'small.bin', 'big.bin'],
    );
  });

  test('sorts the folders by size too once their sizes are known, those not counted as if empty, and by name when alike', () => {
    const entries = [
      folder('small', { size: 10 }),
      folder('uncounted'),
      folder('big', { size: 500 }),
      folder('also small', { size: 10 }),
      entry('file.bin', { size: 1 }),
    ];
    assert.deepStrictEqual(
      keys(entries, { column: 'size', descending: false, groupByColor: false }),
      ['uncounted', 'also small', 'small', 'big', 'file.bin'],
    );
    assert.deepStrictEqual(
      keys(entries, { column: 'size', descending: true, groupByColor: false }),
      ['big', 'small', 'also small', 'uncounted', 'file.bin'],
    );
  });

  test('takes the entry of a folder told again once it is no longer being counted, or the folders under it that could not be read change, its size alike', () => {
    const sort: Sort = {
      column: 'size',
      descending: false,
      groupByColor: false,
    };
    const counting = [folder('photos', { size: 7, counting: true })];
    const before = rowsOf(counting, false, true, sort);
    for (const told of [
      folder('photos', { size: 7 }),
      folder('photos', { size: 7, counting: true, unreadFolders: 1 }),
    ]) {
      const rows = rowsOf([told], false, true, sort, undefined, undefined, {
        entries: counting,
        rows: before,
      });
      assert.deepStrictEqual(rows[0]?.entry, told);
    }
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

  test('groups the files by the color their extension has, in the order of the groups and the files of no group last, by the column within each group, the folders first as ever', () => {
    assert.deepStrictEqual(
      keys(
        grouped,
        { column: 'name', descending: false, groupByColor: true },
        { parent: true, groups },
      ),
      [
        '..',
        'src',
        'y.com',
        'z.exe',
        'b.txt',
        'c.md',
        'a.png',
        'IMAGE.PNG',
        'd.zip',
        'README',
      ],
    );
  });

  test('puts the files the viewer knows the language of where the group of the languages is, the files of an earlier group staying in it', () => {
    assert.deepStrictEqual(
      keys(
        [
          entry('b.txt'),
          entry('main.ts'),
          entry('Dockerfile'),
          entry('a.png'),
          entry('notes.md'),
          entry('data.bin'),
        ],
        { column: 'name', descending: false, groupByColor: true },
        {
          groups: fileColorsOf([
            { extensions: ['md', 'txt'], colors },
            { extensions: 'languages', colors },
            { extensions: ['png'], colors },
          ]),
        },
      ),
      ['b.txt', 'notes.md', 'Dockerfile', 'main.ts', 'a.png', 'data.bin'],
    );
  });

  test('puts the files with an exec bit that no earlier group claims where the group of the executables is', () => {
    assert.deepStrictEqual(
      keys(
        [
          entry('b.txt', { executable: true }),
          entry('git', { executable: true }),
          entry('a.png'),
          entry('LICENSE'),
          entry('configure', { executable: true }),
        ],
        { column: 'name', descending: false, groupByColor: true },
        {
          groups: fileColorsOf([
            { extensions: ['txt'], colors },
            { extensions: 'executables', colors },
            { extensions: ['png'], colors },
          ]),
        },
      ),
      ['b.txt', 'configure', 'git', 'a.png', 'LICENSE'],
    );
  });

  test('sorts again the files whose exec bit changed, as it may move them to another group of colors', () => {
    const sort: Sort = {
      column: 'name',
      descending: false,
      groupByColor: true,
    };
    const executables = fileColorsOf([{ extensions: 'executables', colors }]);
    const before = [entry('a'), entry('b')];
    const rows = rowsOf(before, false, true, sort, undefined, executables);
    const after = [entry('a'), entry('b', { executable: true })];
    assert.deepStrictEqual(
      rowsOf(after, false, true, sort, undefined, executables, {
        entries: before,
        rows,
      }).map((row) => row.key),
      ['b', 'a'],
    );
  });

  test('reverses the column within each group of colors, keeping the groups in their order', () => {
    assert.deepStrictEqual(
      keys(
        grouped,
        { column: 'size', descending: true, groupByColor: true },
        { groups },
      ),
      [
        'src',
        'y.com',
        'z.exe',
        'b.txt',
        'c.md',
        'IMAGE.PNG',
        'a.png',
        'README',
        'd.zip',
      ],
    );
  });

  test('leaves the groups of colors out of the order until it is asked to group by them', () => {
    assert.deepStrictEqual(
      keys(
        grouped,
        { column: 'name', descending: false, groupByColor: false },
        { groups },
      ),
      [
        'src',
        'a.png',
        'b.txt',
        'c.md',
        'd.zip',
        'IMAGE.PNG',
        'README',
        'y.com',
        'z.exe',
      ],
    );
  });

  test('marks the folders named as repositories, never a file or the parent', () => {
    const rows = rowsOf(
      [folder('app'), folder('docs'), entry('app.txt')],
      true,
      true,
      defaultSort,
      new Set(['app', 'app.txt', '..']),
    );
    assert.deepStrictEqual(
      rows.map((row) => `${row.key} ${row.repository}`),
      ['.. false', 'app true', 'docs false', 'app.txt false'],
    );
  });

  test('keeps the folders in the order of their names by extension, whether they are repositories or not', () => {
    const entries = [
      folder('zeta'),
      folder('beta'),
      folder('alpha'),
      entry('a.txt'),
    ];
    const repositories = new Set(['zeta', 'beta']);
    const sorted = (sort: Sort) =>
      rowsOf(entries, false, true, sort, repositories).map((row) => row.key);

    assert.deepStrictEqual(sorted(defaultSort), [
      'alpha',
      'beta',
      'zeta',
      'a.txt',
    ]);
    assert.deepStrictEqual(
      sorted({ column: 'extension', descending: true, groupByColor: false }),
      ['zeta', 'beta', 'alpha', 'a.txt'],
    );
  });

  test('orders the rows of a folder listed again as it would order them afresh, starting from the rows it had, whatever came, went or changed, by every column either way and grouped by color', () => {
    const random = (() => {
      let seed = 7;
      return (below: number) => {
        seed = (seed * 48271) % 2147483647;
        return seed % below;
      };
    })();
    const names = ['a', 'B', 'file10', 'file9', 'é', 'z.txt', 'Z.TXT', 'x.md'];
    const listed = () =>
      Array.from({ length: 30 }, (_, index) =>
        entry(
          `${names[random(names.length)]}${index}.${['txt', 'md', 'png', ''][random(4)]}`,
          {
            folder: random(5) === 0,
            size: random(4),
            modified: random(4),
            hidden: random(6) === 0,
          },
        ),
      ).filter(() => random(4) !== 0);
    for (const column of ['name', 'extension', 'size', 'date'] as const) {
      for (const descending of [false, true]) {
        const sort = { column, descending, groupByColor: column === 'name' };
        for (const showHidden of [true, false]) {
          let previous = listed();
          let rows = rowsOf(
            previous,
            true,
            showHidden,
            sort,
            undefined,
            groups,
          );
          for (let round = 0; round < 10; round++) {
            const entries =
              round % 3 === 0
                ? previous.map((each) => ({ ...each }))
                : [
                    ...rows.flatMap((row) =>
                      row.entry === undefined || random(4) === 0
                        ? []
                        : [
                            random(3) === 0
                              ? { ...row.entry, size: random(4) }
                              : row.entry,
                          ],
                    ),
                    ...listed().slice(0, random(5)),
                  ].filter(
                    (each, index, all) =>
                      all.findIndex((other) => other.name === each.name) ===
                      index,
                  );
            const afresh = rowsOf(
              entries,
              true,
              showHidden,
              sort,
              undefined,
              groups,
            );
            rows = rowsOf(entries, true, showHidden, sort, undefined, groups, {
              entries: previous,
              rows,
            });
            previous = entries;
            assert.deepStrictEqual(
              rows,
              afresh,
              `${column} ${descending} ${round}`,
            );
          }
        }
      }
    }
  });
});
