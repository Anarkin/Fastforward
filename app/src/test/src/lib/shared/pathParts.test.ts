import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { pathParts } from '../../../../lib/shared/pathParts';

suite('The parts of a path', () => {
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

  test('takes a drive written alone, as its button shows it, for its root, so what is done on it is done on the root rather than on the folder Windows keeps current on the drive', () => {
    assert.deepStrictEqual(pathParts('C:'), [
      { name: 'C:', path: 'C:\\', separator: '' },
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
