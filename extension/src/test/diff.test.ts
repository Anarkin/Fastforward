import * as assert from 'node:assert';
import {
  parseHistory,
  parseLog,
  parseNameStatus,
  parseNumstat,
} from '../git/show';
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
      ].join('\n'),
    ).map((file) => file.path);
    assert.deepStrictEqual(paths, ['x b/y.txt', 'docs/a b/new.md', 'gone.txt']);
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

suite('git show parsers', () => {
  test('parses name-status with renames', () => {
    assert.deepStrictEqual(
      parseNameStatus('M\0a.ts\0R087\0old.ts\0new.ts\0A\0b.ts\0'),
      [
        { status: 'M', oldPath: undefined, path: 'a.ts' },
        { status: 'R', oldPath: 'old.ts', path: 'new.ts' },
        { status: 'A', oldPath: undefined, path: 'b.ts' },
      ],
    );
  });

  test('parses numstat with renames and binary files', () => {
    assert.deepStrictEqual(
      [
        ...parseNumstat(
          [
            '1\t2\ta.ts',
            '3\t0\t',
            'old.ts',
            'new.ts',
            '-\t-\timg.png',
            '',
          ].join('\0'),
        ),
      ],
      [
        ['a.ts', { insertions: 1, deletions: 2 }],
        ['new.ts', { insertions: 3, deletions: 0 }],
        ['img.png', { insertions: 0, deletions: 0 }],
      ],
    );
  });
});

suite('git log parser', () => {
  test('parses commits and counts their files', () => {
    const output = [
      '\x1eaaa\0p1 p2\0Ann\0ann@example.com\0',
      '1700000000\0Subject\n\nBody\n\0',
      '\n:100644 100644 1111111 2222222 M\0a.ts\0',
      ':000000 100644 0000000 3333333 A\0b.ts\0',
      '\x1ebbb\0\0Bob\0bob@example.com\0',
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
        files: 0,
      },
    ]);
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
