import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { folderKey } from '../../../../../tools/commander/shared/paths';

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
