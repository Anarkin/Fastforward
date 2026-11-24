import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { stockOf } from '../../../../../tools/commander/main/originals';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

let folder: string;

beforeEach(() => {
  folder = tempFolder('originals');
});

afterEach(() => {
  removeFolder(folder);
});

const at = (...parts: string[]) => path.join(folder, ...parts);

function write(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

const left = (root: string) =>
  fs
    .readdirSync(root, { recursive: true, encoding: 'utf8' })
    .map((name) => name.replaceAll('\\', '/'))
    .toSorted();

suite('Originals of a move into an archive', () => {
  test('deletes what was there when packing started, a read-only file too, folders and all', async () => {
    write(at('moved', 'a.txt'), 'a');
    write(at('moved', 'sub', 'b.txt'), 'b');
    fs.chmodSync(at('moved', 'sub', 'b.txt'), 0o444);
    write(at('alone.txt'), 'alone');

    const stocks = await Promise.all([
      stockOf(at('moved')),
      stockOf(at('alone.txt')),
    ]);

    for (const stock of stocks) {
      assert.deepStrictEqual(await stock.remove(), []);
    }
    assert.deepStrictEqual(left(folder), []);
  });

  test('keeps a file made or changed in a folder moved while it was packed, and the folders holding it, rather than deleting what was never packed', async () => {
    write(at('moved', 'a.txt'), 'a');
    write(at('moved', 'sub', 'b.txt'), 'b');
    write(at('moved', 'c.txt'), 'c');

    const stock = await stockOf(at('moved'));
    write(at('moved', 'a.txt'), 'changed while packed');
    write(at('moved', 'sub', 'new.txt'), 'new');

    assert.deepStrictEqual(await stock.remove(), [
      at('moved', 'a.txt'),
      at('moved', 'sub'),
      at('moved'),
    ]);
    assert.deepStrictEqual(left(at('moved')), ['a.txt', 'sub', 'sub/new.txt']);
  });
});
