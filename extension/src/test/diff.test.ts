import * as assert from 'node:assert';
import { parseNameStatus, parseNumstat } from '../git/show';
import { parsePatch } from '../webview/diff';

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
