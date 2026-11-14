import * as assert from 'node:assert';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { suite, test } from 'vitest';
import {
  filesOfUriList,
  gnomeCopiedFiles,
  uriListOf,
} from '../../../../../tools/commander/main/fileUris';

const root = path.resolve('/');
const at = (...names: string[]) => path.join(root, ...names);

suite('File URIs', () => {
  test('lists files as the file URIs of an RFC 2483 list, one a line, escaping what URIs must', () => {
    assert.strictEqual(
      uriListOf([at('a b.txt'), at('dir', '#1')]),
      [
        pathToFileURL(at('a b.txt')).href,
        pathToFileURL(at('dir', '#1')).href,
      ].join('\r\n'),
    );
  });

  test('reads the files of such a list, by either line end, leaving out comments, other schemes, what is not a URI and the same file twice', () => {
    const one = pathToFileURL(at('a b.txt')).href;
    const two = pathToFileURL(at('dir')).href;
    assert.deepStrictEqual(
      filesOfUriList(
        `# copied\r\n${one}\r\nhttps://example.com/x\n\nnot a uri\n${two}\n${one}\r\n`,
      ),
      [at('a b.txt'), at('dir')],
    );
    assert.deepStrictEqual(filesOfUriList(''), []);
  });

  test('tells the file managers of GNOME the files are copied, not cut', () => {
    assert.strictEqual(
      gnomeCopiedFiles([at('a.txt'), at('b.txt')]),
      `copy\n${pathToFileURL(at('a.txt')).href}\n${pathToFileURL(at('b.txt')).href}`,
    );
  });
});
