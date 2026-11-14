import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  blobsToSize,
  parseChanges,
  parseRawChanges,
} from '../../../../../tools/git/main/rawChanges';

function raw(status: string): string {
  return `:100644 100644 1111111 2222222 ${status}`;
}

const blob = (digit: string) => digit.repeat(40);

suite('Sizes of the changed files', () => {
  test('sizes the blobs of the files with changed lines, not the commit a submodule points to, which a partial clone would try to fetch', () => {
    const changes = parseRawChanges(
      [
        `:100644 100644 ${blob('1')} ${blob('2')} M`,
        'a.ts',
        `:160000 160000 ${blob('3')} ${blob('4')} M`,
        'lib',
        `:000000 100644 ${blob('0')} ${blob('5')} A`,
        'new.ts',
        `:100644 160000 ${blob('6')} ${blob('7')} T`,
        'vendor',
        '1\t1\ta.ts',
        '2\t2\tlib',
        '1\t0\tnew.ts',
        '1\t1\tvendor',
        '',
      ].join('\0'),
    );
    assert.deepStrictEqual(blobsToSize(changes), [
      blob('1'),
      blob('2'),
      blob('5'),
      blob('6'),
    ]);
  });

  test('sizes no blob of the side read from disk, whose id git hashed from the file and a partial clone would try to fetch', () => {
    const changes = parseRawChanges(
      [
        `:100644 100644 ${blob('1')} ${blob('2')} R090`,
        'old.ts',
        'new.ts',
        `:100644 100644 ${blob('3')} ${blob('0')} M`,
        'a.ts',
        '1\t1\t',
        'old.ts',
        'new.ts',
        '1\t1\ta.ts',
        '',
      ].join('\0'),
    );
    assert.deepStrictEqual(blobsToSize(changes, { fromDisk: true }), [
      blob('1'),
      blob('3'),
    ]);
    assert.deepStrictEqual(
      blobsToSize(changes, { fromDisk: true, reverse: true }),
      [blob('2')],
    );
  });
});

suite('Git show parsers', () => {
  test('parses raw and numstat output with renames and binary files', () => {
    assert.deepStrictEqual(
      parseChanges(
        [
          raw('M'),
          'a.ts',
          raw('R087'),
          'old.ts',
          'new.ts',
          raw('A'),
          ':b.ts',
          raw('A'),
          '1\t1\timg.png',
          raw('A'),
          'two\nlines',
          '1\t2\ta.ts',
          '5\t0\ttwo\nlines',
          '3\t0\t',
          'old.ts',
          'new.ts',
          '1\t0\t:b.ts',
          '-\t-\t1\t1\timg.png',
          '',
        ].join('\0'),
      ),
      [
        {
          status: 'M',
          oldPath: undefined,
          path: 'a.ts',
          insertions: 1,
          deletions: 2,
        },
        {
          status: 'R',
          oldPath: 'old.ts',
          path: 'new.ts',
          insertions: 3,
          deletions: 0,
        },
        {
          status: 'A',
          oldPath: undefined,
          path: ':b.ts',
          insertions: 1,
          deletions: 0,
        },
        {
          status: 'A',
          oldPath: undefined,
          path: '1\t1\timg.png',
          insertions: 0,
          deletions: 0,
        },
        {
          status: 'A',
          oldPath: undefined,
          path: 'two\nlines',
          insertions: 5,
          deletions: 0,
        },
      ],
    );
  });

  test('keeps the object of a file moved or copied unchanged, which its patch leaves out', () => {
    const id = 'a'.repeat(40);
    const same = (status: string) => `:100644 100644 ${id} ${id} ${status}`;
    assert.deepStrictEqual(
      parseChanges(
        [
          same('R100'),
          'old.png',
          'new.png',
          same('C100'),
          'new.png',
          'copy.png',
          raw('R087'),
          'a.ts',
          'b.ts',
          '',
        ].join('\0'),
      ).map((change) => [change.path, change.id]),
      [
        ['new.png', id],
        ['copy.png', id],
        ['b.ts', undefined],
      ],
    );
  });

  test('marks a symbolic link by the mode git gives it, a deleted one by the mode it had, and a type change by the mode it ends with', () => {
    const none = blob('0');
    const changes = parseChanges(
      [
        `:000000 120000 ${none} ${blob('1')} A`,
        'added',
        `:120000 000000 ${blob('1')} ${none} D`,
        'deleted',
        `:120000 120000 ${blob('1')} ${blob('2')} M`,
        'retargeted',
        `:100644 120000 ${blob('1')} ${blob('2')} T`,
        'now a link',
        `:120000 100644 ${blob('1')} ${blob('2')} T`,
        'now a file',
        `:120000 120000 ${blob('1')} ${blob('1')} R100`,
        'old',
        'new',
        `:100644 100644 ${blob('1')} ${blob('2')} M`,
        'file',
        '',
      ].join('\0'),
    );
    assert.deepStrictEqual(
      changes.map((change) => [change.path, change.link]),
      [
        ['added', true],
        ['deleted', true],
        ['retargeted', true],
        ['now a link', true],
        ['now a file', undefined],
        ['new', true],
        ['file', undefined],
      ],
    );
    assert.ok(!('link' in changes[6]));
  });

  test('parses copies, type changes and unknown statuses', () => {
    assert.deepStrictEqual(
      parseChanges(
        [
          raw('C075'),
          'src.ts',
          'copy.ts',
          raw('T'),
          'link',
          raw('U'),
          'odd',
          raw('M'),
          'after.ts',
          '2\t0\t',
          'src.ts',
          'copy.ts',
          '1\t1\tafter.ts',
          '',
        ].join('\0'),
      ),
      [
        {
          status: 'C',
          oldPath: 'src.ts',
          path: 'copy.ts',
          insertions: 2,
          deletions: 0,
        },
        {
          status: 'T',
          oldPath: undefined,
          path: 'link',
          insertions: 0,
          deletions: 0,
        },
        {
          status: '?',
          oldPath: undefined,
          path: 'odd',
          insertions: 0,
          deletions: 0,
        },
        {
          status: 'M',
          oldPath: undefined,
          path: 'after.ts',
          insertions: 1,
          deletions: 1,
        },
      ],
    );
  });
});
