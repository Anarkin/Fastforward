import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  FileHashes,
  LineCounts,
  untrackedListing,
} from '../../../../../tools/git/main/cli/workingTree';
import { removeFolder, tempFolder } from '../../../../repositories';

suite('Untracked files', () => {
  test('lists them with git status on Windows, which reads the folders through its cache, keeping only the untracked ones', () => {
    const { args, paths } = untrackedListing('win32');
    assert.deepStrictEqual(args.slice(0, 3), [
      '-c',
      'core.fscache=true',
      'status',
    ]);
    assert.deepStrictEqual(
      paths(
        '1 .M N... 100644 100644 100644 aaa bbb a.txt\0? new file.txt\0? nested/\0',
      ),
      ['new file.txt', 'nested/'],
    );
  });

  test('lists them with ls-files elsewhere', () => {
    const { args, paths } = untrackedListing('linux');
    assert.strictEqual(args[0], 'ls-files');
    assert.deepStrictEqual(paths('a.txt\0nested/\0'), ['a.txt', 'nested/']);
  });
});

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

suite('Lines of untracked files', () => {
  let folder: string;

  beforeEach(() => {
    folder = tempFolder('line-counts');
  });

  afterEach(() => removeFolder(folder));

  test('counts the lines of a file again only once it changes on disk, as each refresh would read every one whole', async () => {
    const file = path.join(folder, 'new.txt');
    fs.writeFileSync(file, 'one\n');
    const counted: string[] = [];
    const counts = new LineCounts(10, (counting) => {
      counted.push(counting);
      return Promise.resolve(
        fs.readFileSync(counting, 'utf8').split('\n').length - 1,
      );
    });
    assert.strictEqual(await counts.of(file), 1);
    assert.strictEqual(await counts.of(file), 1);
    fs.writeFileSync(file, 'one\ntwo\n');
    assert.strictEqual(await counts.of(file), 2);
    assert.deepStrictEqual(counted, [file, file]);
  });
});
