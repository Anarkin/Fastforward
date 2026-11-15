import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { copiedText } from '../../../../../tools/commander/page/copiedText';

suite('Commander copied text', () => {
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
