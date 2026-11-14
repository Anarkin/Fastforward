import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  baseNameOf,
  copiedText,
  newFileProblem,
  newFolderProblem,
  renameProblem,
  renamedPart,
} from '../../../../tools/commander/page/naming';
import { strings } from '../../../../lib/shared/strings';

const entry = (name: string) => ({
  name,
  folder: false,
  link: false,
  hidden: false,
  size: 1,
  modified: 0,
});

suite('Commander naming', () => {
  test('says a name is there already when the side lists it, by case on Windows and macOS as their file systems do', () => {
    const listed = [entry('Photos'), entry('notes.txt')];
    assert.strictEqual(
      newFolderProblem('photos', listed, 'win32'),
      strings.commander.nameThere,
    );
    assert.strictEqual(
      newFolderProblem('PHOTOS', listed, 'darwin'),
      strings.commander.nameThere,
    );
    assert.strictEqual(newFolderProblem('photos', listed, 'linux'), undefined);
    assert.strictEqual(newFolderProblem('new', listed, 'win32'), undefined);
  });

  test('lets a new file be named as a file already there, which opens it, but not as a folder there or with a name the system refuses', () => {
    const listed = [entry('notes.txt'), { ...entry('docs'), folder: true }];
    assert.strictEqual(newFileProblem('notes.txt', listed, 'win32'), undefined);
    assert.strictEqual(
      newFileProblem('DOCS', listed, 'win32'),
      strings.commander.folderThere,
    );
    assert.strictEqual(newFileProblem('DOCS', listed, 'linux'), undefined);
    assert.deepStrictEqual(
      newFileProblem('con', listed, 'win32'),
      strings.commander.reservedName('con'),
    );
  });

  test('says what is wrong with a name before whether it is there', () => {
    assert.deepStrictEqual(
      newFolderProblem('con', [entry('con')], 'win32'),
      strings.commander.reservedName('con'),
    );
    assert.strictEqual(
      newFolderProblem('', [], 'linux'),
      strings.commander.noName,
    );
  });

  test('lets a name be renamed to itself in another case, saying when another file of the folder has the new name, by case on Windows and macOS', () => {
    const listed = [entry('Photos'), entry('notes.txt')];
    assert.strictEqual(
      renameProblem('photos', 'Photos', listed, 'win32'),
      undefined,
    );
    assert.strictEqual(
      renameProblem('NOTES.txt', 'Photos', listed, 'darwin'),
      strings.commander.nameThere,
    );
    assert.strictEqual(
      renameProblem('NOTES.txt', 'Photos', listed, 'linux'),
      undefined,
    );
    assert.deepStrictEqual(
      renameProblem('a/b', 'Photos', undefined, 'linux'),
      strings.commander.nameCantHold('/'),
    );
  });

  test('renames a file listed flat by its own name, after the last folder of its path, the backslash being a folder only on Windows', () => {
    assert.strictEqual(baseNameOf('docs\\deep\\a.txt', 'win32'), 'a.txt');
    assert.strictEqual(baseNameOf('docs/a.txt', 'win32'), 'a.txt');
    assert.strictEqual(
      baseNameOf('docs/back\\slash.txt', 'linux'),
      'back\\slash.txt',
    );
    assert.strictEqual(baseNameOf('a.txt', 'darwin'), 'a.txt');
  });

  test('selects the name of a file before its extension to rename it, and the whole name of a folder or of a file named by a dot', () => {
    assert.strictEqual(renamedPart('report.final.pdf', false), 16 - 4);
    assert.strictEqual(renamedPart('archive.tar.gz', true), 14);
    assert.strictEqual(renamedPart('.gitignore', false), 10);
    assert.strictEqual(renamedPart('README', false), 6);
  });

  test('copies the paths of the items named in the folder of the side, without quotes, a line each as the system ends its lines, or the path of the folder itself for none', () => {
    assert.deepStrictEqual(
      [
        copiedText('paths', 'C:\\Code', ['a.txt'], 'win32'),
        copiedText('paths', 'C:\\', ['Program Files', 'pagefile.sys'], 'win32'),
        copiedText('paths', 'C:\\Code', ['sub\\b.txt'], 'win32'),
        copiedText('paths', 'C:\\Code', [], 'win32'),
        copiedText('paths', '/home/me', ['a.txt', 'My Files'], 'linux'),
        copiedText('paths', '/', [], 'darwin'),
      ],
      [
        'C:\\Code\\a.txt',
        'C:\\Program Files\r\nC:\\pagefile.sys',
        'C:\\Code\\sub\\b.txt',
        'C:\\Code',
        '/home/me/a.txt\n/home/me/My Files',
        '/',
      ],
    );
  });

  test('copies the names of the items named, without the folders a flat side shows them under, or the name of the folder itself for none', () => {
    assert.deepStrictEqual(
      [
        copiedText('names', 'C:\\Code', ['a.txt', 'sub\\b.txt'], 'win32'),
        copiedText('names', 'C:\\Code', [], 'win32'),
        copiedText('names', 'C:\\', [], 'win32'),
        copiedText('names', '/home/me', ['sub/b.txt'], 'linux'),
      ],
      ['a.txt\r\nb.txt', 'Code', 'C:\\', 'b.txt'],
    );
  });
});
