import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  pastedLink,
  pastedPaths,
} from '../../../../../tools/canvas/page/links';

suite('Canvas links', () => {
  test('takes a text pasted for a link only when it is one URL of the web over https, which a link node opens, its blanks around it left out', () => {
    assert.strictEqual(
      pastedLink('  https://example.com/a?b=c#d \n'),
      'https://example.com/a?b=c#d',
    );
    for (const text of [
      'http://example.com',
      'plain words',
      'https://example.com/a https://example.com/b',
      'ftp://example.com/file',
      'file:///etc/passwd',
      'javascript:alert(1)',
      '',
    ]) {
      assert.strictEqual(pastedLink(text), undefined, text);
    }
  });

  test('takes a text pasted for paths only when every line of it is a whole path, of Windows, of a share or of macOS and Linux, its quotes and blanks left out', () => {
    assert.deepStrictEqual(
      pastedPaths(
        '"C:\\Code\\notes\\a.md"\r\n  D:/work/b.txt \n\n\\\\server\\share\\c.md\n/home/me/d.md',
      ),
      [
        'C:\\Code\\notes\\a.md',
        'D:/work/b.txt',
        '\\\\server\\share\\c.md',
        '/home/me/d.md',
      ],
    );
    for (const text of [
      'notes/a.md',
      'C:\\a.md\nnot a path',
      'https://example.com/a',
      '',
      '   ',
    ]) {
      assert.strictEqual(pastedPaths(text), undefined, text);
    }
  });
});
