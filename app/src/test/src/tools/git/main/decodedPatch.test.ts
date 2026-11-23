import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { decodedPatch } from '../../../../../tools/git/main/decodedPatch';

const oldId = 'a'.repeat(40);
const newId = 'b'.repeat(40);
const none = '0'.repeat(40);

const wide = (text: string) =>
  Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);

const sides = (
  blobs: Readonly<Record<string, Buffer>>,
  files: Readonly<Record<string, Buffer>> = {},
) => {
  const compared: (readonly [string, string])[] = [];
  const asked: (readonly string[])[] = [];
  return {
    compared,
    asked,
    sides: {
      blobsOf: (ids: readonly string[]) => {
        asked.push(ids);
        return Promise.resolve(
          new Map(
            ids.flatMap((id) => {
              const blob = blobs[id];
              return blob === undefined ? [] : [[id, blob] as const];
            }),
          ),
        );
      },
      fileOf: (path: string) => Promise.resolve(files[path]),
      hunksOf: (old: string, changed: string) => {
        compared.push([old, changed]);
        return Promise.resolve(
          `diff --git a/x b/y\nindex 1..2 100644\n--- a/x\n+++ b/y\n@@ -1 +1 @@\n-${old.trim()}\n+${changed.trim()}\n`,
        );
      },
      codePage: 'windows-1252' as const,
    },
  };
};

suite('Patches of git read in the encodings of their files', () => {
  test('diffs a file git takes for binary as the text of its encoding, UTF-16 here, keeping its header and naming the encoding of each side, and a file of the code page of the system whose bytes git showed as UTF-8, leaving a file of UTF-8 and a binary file as git showed them', async () => {
    const patch = [
      'diff --git a/wide.txt b/wide.txt',
      `index ${oldId}..${newId} 100644`,
      'Binary files a/wide.txt and b/wide.txt differ',
      'diff --git a/plain.txt b/plain.txt',
      `index ${oldId}..${oldId} 100644`,
      '--- a/plain.txt',
      '+++ b/plain.txt',
      '@@ -1 +1 @@',
      '-one',
      '+two',
      'diff --git a/data.bin b/data.bin',
      `index ${none}..${'c'.repeat(40)}`,
      'Binary files /dev/null and b/data.bin differ',
      'diff --git a/latin.txt b/latin.txt',
      `new file mode 100644`,
      `index ${none}..${'d'.repeat(40)}`,
      '--- /dev/null',
      '+++ b/latin.txt',
      '@@ -0,0 +1 @@',
      '+caf�',
      '',
    ].join('\n');
    const {
      compared,
      asked,
      sides: read,
    } = sides({
      [oldId]: wide('one\n'),
      [newId]: wide('two\n'),
      ['c'.repeat(40)]: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]),
      ['d'.repeat(40)]: Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]),
    });

    assert.strictEqual(
      await decodedPatch(patch, read),
      [
        'diff --git a/wide.txt b/wide.txt',
        `index ${oldId}..${newId} 100644`,
        'encoding utf-16le utf-16le',
        '--- a/wide.txt',
        '+++ b/wide.txt',
        '@@ -1 +1 @@',
        '-one',
        '+two',
        'diff --git a/plain.txt b/plain.txt',
        `index ${oldId}..${oldId} 100644`,
        '--- a/plain.txt',
        '+++ b/plain.txt',
        '@@ -1 +1 @@',
        '-one',
        '+two',
        'diff --git a/data.bin b/data.bin',
        `index ${none}..${'c'.repeat(40)}`,
        'Binary files /dev/null and b/data.bin differ',
        'diff --git a/latin.txt b/latin.txt',
        `new file mode 100644`,
        `index ${none}..${'d'.repeat(40)}`,
        'encoding windows-1252 windows-1252',
        '--- /dev/null',
        '+++ b/latin.txt',
        '@@ -1 +1 @@',
        '-',
        '+café',
        '',
      ].join('\n'),
    );
    assert.deepStrictEqual(compared, [
      ['one\n', 'two\n'],
      ['', 'café\n'],
    ]);
    assert.deepStrictEqual(
      asked,
      [[oldId, newId, 'c'.repeat(40), 'd'.repeat(40)]],
      'every blob read in one go',
    );
  });

  test('reads the new side of a file of the working tree from disk, as git has no blob of it', async () => {
    const patch = [
      'diff --git a/w.txt b/w.txt',
      `index ${oldId}..${'e'.repeat(40)} 100644`,
      'Binary files a/w.txt and b/w.txt differ',
      '',
    ].join('\n');
    const { sides: read } = sides(
      { [oldId]: wide('one\n') },
      { 'w.txt': wide('two\n') },
    );
    assert.ok(
      (await decodedPatch(patch, read)).endsWith(
        [
          'encoding utf-16le utf-16le',
          '--- a/w.txt',
          '+++ b/w.txt',
          '@@ -1 +1 @@',
          '-one',
          '+two',
          '',
        ].join('\n'),
      ),
    );
  });

  test('leaves a patch with nothing git took for binary and no character it could not read as it is, reading no file', async () => {
    const patch =
      'diff --git a/a b/a\nindex 1..2\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n-x\n+y\n';
    const { compared, sides: read } = sides({});
    assert.strictEqual(await decodedPatch(patch, read), patch);
    assert.deepStrictEqual(compared, []);
  });
});
