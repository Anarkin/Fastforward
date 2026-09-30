import * as assert from 'node:assert';
import { parseChanges, pathspecs } from '../git/diff';
import { parseHistory, parseLog } from '../git/history';
import { parsePatch, unquotePath } from '../webview/diff';

suite('parsePatch', () => {
  test('numbers context, removed and added lines', () => {
    const files = parsePatch(
      [
        'diff --git a/src/a.ts b/src/a.ts',
        'index 1111111..2222222 100644',
        '--- a/src/a.ts',
        '+++ b/src/a.ts',
        '@@ -10,3 +10,3 @@ function a() {',
        ' keep',
        '-old',
        '+new',
        ' keep',
        '',
      ].join('\n'),
    );
    assert.strictEqual(files.length, 1);
    assert.strictEqual(files[0].path, 'src/a.ts');
    assert.strictEqual(files[0].hunks[0].header, 'function a() {');
    assert.deepStrictEqual(
      files[0].hunks[0].lines.map((line) => [
        line.kind,
        line.oldNumber,
        line.newNumber,
        line.text,
      ]),
      [
        ['context', 10, 10, 'keep'],
        ['removed', 11, undefined, 'old'],
        ['added', undefined, 11, 'new'],
        ['context', 12, 12, 'keep'],
      ],
    );
  });

  test('takes paths with " b/" in them from the diff exactly', () => {
    const paths = parsePatch(
      [
        'diff --git a/x b/y.txt b/x b/y.txt',
        '--- a/x b/y.txt\t',
        '+++ b/x b/y.txt\t',
        '@@ -1 +1 @@',
        '-a',
        '+b',
        'diff --git a/docs/a b/old.md b/docs/a b/new.md',
        'similarity index 90%',
        'rename from docs/a b/old.md',
        'rename to docs/a b/new.md',
        'diff --git a/gone.txt b/gone.txt',
        'deleted file mode 100644',
        '--- a/gone.txt',
        '+++ /dev/null',
        '@@ -1 +0,0 @@',
        '-bye',
        'diff --git a/x b/y.png b/x b/y.png',
        'Binary files a/x b/y.png and b/x b/y.png differ',
      ].join('\n'),
    ).map((file) => file.path);
    assert.deepStrictEqual(paths, [
      'x b/y.txt',
      'docs/a b/new.md',
      'gone.txt',
      'x b/y.png',
    ]);
  });

  test('unquotes paths git quotes', () => {
    assert.strictEqual(unquotePath('"back\\\\slash"'), 'back\\slash');
    assert.strictEqual(unquotePath('"a\\tb"'), 'a\tb');
    assert.strictEqual(unquotePath('"\\303\\251t\\303\\251.md"'), 'été.md');
    assert.strictEqual(unquotePath('plain.md'), 'plain.md');
    const [file] = parsePatch(
      [
        'diff --git "a/say \\"hi\\".md" "b/say \\"hi\\".md"',
        '--- "a/say \\"hi\\".md"',
        '+++ "b/say \\"hi\\".md"',
        '@@ -1 +1 @@',
        '-a',
        '+b',
      ].join('\n'),
    );
    assert.strictEqual(file.path, 'say "hi".md');
  });

  test('marks binary files and splits multiple files', () => {
    const files = parsePatch(
      [
        'diff --git a/image.png b/image.png',
        'Binary files a/image.png and b/image.png differ',
        'diff --git a/b.txt b/b.txt',
        '@@ -0,0 +1 @@',
        '+hello',
      ].join('\n'),
    );
    assert.deepStrictEqual(
      files.map((file) => [file.path, file.binary, file.hunks.length]),
      [
        ['image.png', true, 0],
        ['b.txt', false, 1],
      ],
    );
  });
});

suite('pathspecs', () => {
  test('narrows to a path, or excludes files literally with pathspec magic', () => {
    assert.deepStrictEqual(pathspecs({}), { args: [], magic: false });
    assert.deepStrictEqual(pathspecs({ path: 'a' }), {
      args: ['--', 'a'],
      magic: false,
    });
    assert.deepStrictEqual(pathspecs({ path: 'b', oldPath: 'a' }), {
      args: ['--', 'a', 'b'],
      magic: false,
    });
    assert.deepStrictEqual(pathspecs({ path: 'a*b', exclude: ['x'] }), {
      args: ['--', 'a*b'],
      magic: false,
    });
    assert.deepStrictEqual(pathspecs({ exclude: ['[ab].md'] }), {
      args: ['--', '.', ':(exclude,literal)[ab].md'],
      magic: true,
    });
  });
});

function raw(status: string): string {
  return `:100644 100644 1111111 2222222 ${status}`;
}

suite('git show parsers', () => {
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

suite('git log parser', () => {
  test('parses commits and counts their files', () => {
    const output = [
      '\x1eaaa\0p1 p2\0Ann\0ann@example.com\0',
      '1700000000\0Carl\0carl@example.com\0',
      '1700000100\0Subject\n\nBody\n\0',
      '\n:100644 100644 1111111 2222222 M\0a.ts\0',
      ':000000 100644 0000000 3333333 A\0b.ts\0',
      '\x1ebbb\0\0Bob\0bob@example.com\0',
      '1600000000\0Bob\0bob@example.com\0',
      '1600000000\0Root\n\0',
    ].join('');
    assert.deepStrictEqual(parseLog(output), [
      {
        hash: 'aaa',
        subject: 'Subject',
        message: 'Subject\n\nBody',
        parents: ['p1', 'p2'],
        authorName: 'Ann',
        authorEmail: 'ann@example.com',
        authorDate: 1_700_000_000_000,
        committerName: 'Carl',
        committerEmail: 'carl@example.com',
        commitDate: 1_700_000_100_000,
        files: 2,
      },
      {
        hash: 'bbb',
        subject: 'Root',
        message: 'Root',
        parents: [],
        authorName: 'Bob',
        authorEmail: 'bob@example.com',
        authorDate: 1_600_000_000_000,
        committerName: 'Bob',
        committerEmail: 'bob@example.com',
        commitDate: 1_600_000_000_000,
        files: 0,
      },
    ]);
  });

  test('reads a message with \\x1e in it, and paths that look like fields', () => {
    const output = [
      '\x1eaaa\0\0Ann\0ann@example.com\0',
      '1700000000\0Ann\0ann@example.com\0',
      '1700000000\0Subject\n\n\x1ebbb\n\0',
      '\n:000000 100644 0000000 1111111 A\0:memo.txt\0',
      ':000000 100644 0000000 2222222 A\0\x1eodd.txt\0',
      '\x1eccc\0aaa\0Bob\0bob@example.com\0',
      '1700000100\0Bob\0bob@example.com\0',
      '1700000100\0Next\n\0',
    ].join('');
    assert.deepStrictEqual(
      parseLog(output).map(({ hash, message, parents, files }) => ({
        hash,
        message,
        parents,
        files,
      })),
      [
        { hash: 'aaa', message: 'Subject\n\n\x1ebbb', parents: [], files: 2 },
        { hash: 'ccc', message: 'Next', parents: ['aaa'], files: 0 },
      ],
    );
  });
});

suite('git rev-list parser', () => {
  test('parses hashes and parents', () => {
    assert.deepStrictEqual(parseHistory('aaa bbb ccc\nbbb\n'), [
      { hash: 'aaa', parents: ['bbb', 'ccc'] },
      { hash: 'bbb', parents: [] },
    ]);
  });
});
