import * as assert from 'node:assert';
import { parsePatch, unquotePath } from '../../webview/diff';

suite('Patch parser', () => {
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

  test('keeps the ids of both sides of a file, but not of a side it lacks', () => {
    const files = parsePatch(
      [
        'diff --git a/a.ts b/a.ts',
        'index 1111111..2222222 100644',
        'diff --git a/b.ts b/b.ts',
        'deleted file mode 100644',
        'index 3333333..0000000',
        'diff --git a/c.ts b/c.ts',
        'old mode 100644',
        'new mode 100755',
        '',
      ].join('\n'),
    );
    assert.deepStrictEqual(
      files.map((file) => file.blobs),
      [
        { old: '1111111', new: '2222222' },
        { old: '3333333', new: undefined },
        undefined,
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

  test('takes the source and target of a copy or a rename, quoted or not', () => {
    const paths = parsePatch(
      [
        'diff --git a/x b/y b/z',
        'similarity index 100%',
        'copy from x',
        'copy to y b/z',
        'diff --git a/plain "b/tab\\there"',
        'similarity index 100%',
        'rename from plain',
        'rename to "tab\\there"',
        'diff --git "a/tab\\there" b/plain',
        'similarity index 100%',
        'rename from "tab\\there"',
        'rename to plain',
      ].join('\n'),
    ).map((file) => [file.oldPath, file.path]);
    assert.deepStrictEqual(paths, [
      ['x', 'y b/z'],
      ['plain', 'tab\there'],
      ['tab\there', 'plain'],
    ]);
  });

  test('unquotes paths git quotes', () => {
    assert.strictEqual(unquotePath('"back\\\\slash"'), 'back\\slash');
    assert.strictEqual(unquotePath('"a\\tb"'), 'a\tb');
    assert.strictEqual(unquotePath('"\\303\\251t\\303\\251.md"'), 'été.md');
    assert.strictEqual(unquotePath('plain.md'), 'plain.md');
    assert.strictEqual(unquotePath('"say \\"hi\\" 😀.md"'), 'say "hi" 😀.md');
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
