import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { withFoldersSavedSince } from '../../../boot/savedPath';

suite('Saved PATH', () => {
  test('adds to the PATH the app started with the folders saved to the PATH of Windows since, as an installer adds its folder there and not to the apps running', () => {
    const env = { Path: 'C:\\Windows\\system32;C:\\Tools', HOME: 'C:\\me' };

    assert.deepStrictEqual(
      withFoldersSavedSince(
        env,
        ['C:\\Windows\\system32', 'C:\\Old'],
        ['C:\\Windows\\system32', 'C:\\Old', 'C:\\Program Files\\Git\\cmd'],
      ),
      {
        Path: 'C:\\Windows\\system32;C:\\Tools;C:\\Program Files\\Git\\cmd',
        HOME: 'C:\\me',
      },
    );
  });

  test('leaves out the folders saved before the app started that its PATH has not, as whoever started it chose that PATH', () => {
    const env = { PATH: 'C:\\Only' };

    assert.deepStrictEqual(
      withFoldersSavedSince(
        env,
        ['C:\\Windows\\system32', 'C:\\Program Files\\Git\\cmd'],
        ['C:\\Windows\\system32', 'C:\\Program Files\\Git\\cmd'],
      ),
      { PATH: 'C:\\Only' },
    );
  });

  test('takes a folder once, whatever its case or a trailing backslash, as Windows does', () => {
    const env = { Path: 'C:\\Tools\\' };

    assert.deepStrictEqual(
      withFoldersSavedSince(
        env,
        [],
        ['c:\\tools', 'C:\\Git\\cmd', 'c:\\git\\CMD\\', 'C:\\Git\\cmd'],
      ),
      { Path: 'C:\\Tools\\;C:\\Git\\cmd' },
    );
  });

  test('makes a PATH of the folders saved since when the app started without one', () => {
    assert.deepStrictEqual(withFoldersSavedSince({}, [], ['C:\\Git\\cmd']), {
      Path: 'C:\\Git\\cmd',
    });
  });
});
