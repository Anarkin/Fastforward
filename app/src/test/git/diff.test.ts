import * as assert from 'node:assert';
import { parseChanges, pathspecs } from '../../git/diff';

suite('Pathspecs', () => {
  test('narrows to a path, or to the files given', () => {
    assert.deepStrictEqual(pathspecs({}), []);
    assert.deepStrictEqual(pathspecs({ path: 'a' }), ['--', 'a']);
    assert.deepStrictEqual(pathspecs({ path: 'b', oldPath: 'a' }), [
      '--',
      'a',
      'b',
    ]);
    assert.deepStrictEqual(pathspecs({ path: 'a*b', include: ['x'] }), [
      '--',
      'a*b',
    ]);
    assert.deepStrictEqual(pathspecs({ include: ['[ab].md'] }), [
      '--',
      '[ab].md',
    ]);
  });
});

function raw(status: string): string {
  return `:100644 100644 1111111 2222222 ${status}`;
}

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
