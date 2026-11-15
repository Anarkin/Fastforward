import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { FileHashes } from '../../../../../tools/git/main/touchedFiles';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

suite('Hashes of files touched', () => {
  let folder: string;

  beforeEach(() => {
    folder = tempFolder('hashes');
  });

  afterEach(() => removeFolder(folder));

  test('hashes a file again only once it changes on disk, as a large binary takes seconds to hash on every refresh', async () => {
    fs.writeFileSync(path.join(folder, 'a.bin'), 'a');
    fs.writeFileSync(path.join(folder, 'b.bin'), 'b');
    const asked: string[][] = [];
    const hashes = new FileHashes(10, (_gitPath, _cwd, files) => {
      asked.push([...files]);
      return Promise.resolve(
        files.map(
          (file) =>
            `${file}:${fs.readFileSync(path.join(folder, file), 'utf8')}`,
        ),
      );
    });
    const of = () => hashes.of('git', folder, ['a.bin', 'b.bin', 'gone.bin']);
    assert.deepStrictEqual(await of(), ['a.bin:a', 'b.bin:b', undefined]);
    assert.deepStrictEqual(await of(), ['a.bin:a', 'b.bin:b', undefined]);
    fs.writeFileSync(path.join(folder, 'b.bin'), 'bb');
    assert.deepStrictEqual(await of(), ['a.bin:a', 'b.bin:bb', undefined]);
    assert.deepStrictEqual(asked, [['a.bin', 'b.bin'], ['b.bin']]);
  });

  test('forgets the least recently hashed files past its limit', async () => {
    for (const file of ['a', 'b', 'c']) {
      fs.writeFileSync(path.join(folder, file), file);
    }
    const asked: string[] = [];
    const hashes = new FileHashes(2, (_gitPath, _cwd, files) => {
      asked.push(...files);
      return Promise.resolve(files.map(() => 'hash'));
    });
    for (const file of ['a', 'b', 'a', 'c', 'a', 'b']) {
      await hashes.of('git', folder, [file]);
    }
    assert.deepStrictEqual(asked, ['a', 'b', 'c', 'b']);
  });

  test('gives the hash of every file asked for at once, and hashes none of them again while unchanged, though they outnumber its limit', async () => {
    const files = ['a', 'b', 'c', 'd'];
    for (const file of files) {
      fs.writeFileSync(path.join(folder, file), file);
    }
    const asked: string[][] = [];
    const hashes = new FileHashes(2, (_gitPath, _cwd, hashing) => {
      asked.push([...hashing]);
      return Promise.resolve(hashing.map((file) => `hash of ${file}`));
    });
    for (let round = 0; round < 2; round++) {
      assert.deepStrictEqual(await hashes.of('git', folder, files), [
        'hash of a',
        'hash of b',
        'hash of c',
        'hash of d',
      ]);
    }
    assert.deepStrictEqual(asked, [files]);
  });
});
