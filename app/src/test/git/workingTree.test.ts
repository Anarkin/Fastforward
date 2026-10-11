import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FileHashes, untrackedListing } from '../../git/workingTree';
import { removeFolder, tempFolder } from '../repositories';

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

  setup(() => {
    folder = tempFolder('hashes');
  });

  teardown(() => removeFolder(folder));

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
});
