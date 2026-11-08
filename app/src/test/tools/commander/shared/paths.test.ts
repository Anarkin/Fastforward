import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { folderKey, pathParts } from '../../../../tools/commander/shared/paths';

suite('The parts of a commander path', () => {
  test('splits a path into its root and each name, with the path up to it and the separator after it', () => {
    assert.deepStrictEqual(pathParts('C:\\Downloads\\notes.txt'), [
      { name: 'C:\\', path: 'C:\\', separator: '' },
      { name: 'Downloads', path: 'C:\\Downloads', separator: '\\' },
      { name: 'notes.txt', path: 'C:\\Downloads\\notes.txt', separator: '' },
    ]);
    assert.deepStrictEqual(pathParts('/home/adam'), [
      { name: '/', path: '/', separator: '' },
      { name: 'home', path: '/home', separator: '/' },
      { name: 'adam', path: '/home/adam', separator: '' },
    ]);
  });

  test('keeps the root of a drive or share whole, as no row names it', () => {
    assert.deepStrictEqual(pathParts('C:\\'), [
      { name: 'C:\\', path: 'C:\\', separator: '' },
    ]);
    assert.deepStrictEqual(pathParts('\\\\server\\share\\docs'), [
      {
        name: '\\\\server\\share\\',
        path: '\\\\server\\share\\',
        separator: '',
      },
      { name: 'docs', path: '\\\\server\\share\\docs', separator: '' },
    ]);
  });

  test('keeps every character of the path, so the parts read as the path', () => {
    for (const each of [
      'C:\\Downloads\\notes.txt',
      'C:\\Program Files\\',
      '/home//adam',
      '\\\\server\\share',
      '',
    ]) {
      assert.strictEqual(
        pathParts(each)
          .map((part) => part.name + part.separator)
          .join(''),
        each,
      );
    }
  });
});

suite('The key of a folder', () => {
  test('ignores the case of its letters where the file system of the platform does, on Windows and macOS, and keeps it on Linux', () => {
    assert.strictEqual(
      folderKey('C:\\Code\\Fastforward', 'win32'),
      folderKey('c:\\code\\fastforward', 'win32'),
    );
    assert.strictEqual(
      folderKey('/Users/adam/Code', 'darwin'),
      folderKey('/users/adam/code', 'darwin'),
    );
    assert.notStrictEqual(
      folderKey('/home/adam/Code', 'linux'),
      folderKey('/home/adam/code', 'linux'),
    );
    assert.notStrictEqual(
      folderKey('/home/adam/Code', undefined),
      folderKey('/home/adam/code', undefined),
    );
  });
});
