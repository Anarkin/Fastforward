import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  folderOfPath,
  folderOfUrl,
  type FolderPlace,
} from '../../../../tools/terminal/main/folders';

const linux: FolderPlace = { platform: 'linux', hostname: 'box' };
const windows: FolderPlace = { platform: 'win32', hostname: 'DESKTOP-1' };

suite('Terminal folders', () => {
  test('takes the folder a shell reports as a path, quoted as Windows Terminal has it or not', () => {
    assert.strictEqual(folderOfPath('/home/me/work', linux), '/home/me/work');
    assert.strictEqual(
      folderOfPath('"C:\\Users\\me\\work"', windows),
      'C:\\Users\\me\\work',
    );
    assert.strictEqual(
      folderOfPath('\\\\server\\share\\work', windows),
      '\\\\server\\share\\work',
    );
  });

  test('takes the paths of Git Bash, MSYS2 and Cygwin on Windows as the Windows paths they stand for', () => {
    assert.strictEqual(
      folderOfPath('/c/Users/me/work', windows),
      'C:\\Users\\me\\work',
    );
    assert.strictEqual(folderOfPath('/d', windows), 'D:\\');
    assert.strictEqual(
      folderOfPath('/cygdrive/c/Users/me', windows),
      'C:\\Users\\me',
    );
    assert.strictEqual(
      folderOfPath('C:/Users/me/work', windows),
      'C:\\Users\\me\\work',
    );
  });

  test('takes no folder it could not find without knowing where the shell is, nor one of another system', () => {
    for (const reported of ['work', '', '""', 'C:work', '\\work', '/usr/bin']) {
      assert.strictEqual(folderOfPath(reported, windows), undefined, reported);
    }
    for (const reported of ['work', '', 'C:\\work']) {
      assert.strictEqual(folderOfPath(reported, linux), undefined, reported);
    }
  });

  test('takes the folder of a file URL on this machine, decoding it, the semicolons nushell encodes too', () => {
    assert.strictEqual(
      folderOfUrl('file://box/home/me/my%20work', linux),
      '/home/me/my work',
    );
    assert.strictEqual(
      folderOfUrl('file://box/home/me/a%3Bb', linux),
      '/home/me/a;b',
    );
    assert.strictEqual(folderOfUrl('file:///home/me', linux), '/home/me');
    assert.strictEqual(
      folderOfUrl('file://localhost/home/me', linux),
      '/home/me',
    );
    assert.strictEqual(
      folderOfUrl('file://desktop-1/C:/Users/me', windows),
      'C:\\Users\\me',
    );
    assert.strictEqual(
      folderOfUrl('file://DESKTOP-1/c/Users/me', windows),
      'C:\\Users\\me',
    );
  });

  test('takes no folder of a URL from another machine, as over SSH, nor of one that is no file URL', () => {
    for (const reported of [
      'file://server/home/me',
      'https://box/home/me',
      'file://box/home/%E0%A4%A',
      'not a url',
    ]) {
      assert.strictEqual(folderOfUrl(reported, linux), undefined, reported);
    }
  });
});
