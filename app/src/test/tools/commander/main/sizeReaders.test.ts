import * as assert from 'node:assert';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  nodeSizeReader,
  windowsSizeReader,
} from '../../../../tools/commander/main/sizeReaders';
import { removeFolder, tempFolder } from '../../../support/repositories';

let folder = '';

beforeEach(() => {
  folder = tempFolder('size-readers');
  fs.writeFileSync(path.join(folder, 'three.bin'), 'abc');
  fs.writeFileSync(path.join(folder, 'four.bin'), 'abcd');
  fs.mkdirSync(path.join(folder, 'inside'));
  fs.writeFileSync(path.join(folder, 'inside', 'big.bin'), 'x'.repeat(100));
  fs.symlinkSync(
    path.join(folder, 'inside'),
    path.join(folder, 'linked'),
    'junction',
  );
  if (process.platform !== 'win32') {
    fs.symlinkSync(
      path.join(folder, 'inside', 'big.bin'),
      path.join(folder, 'big link'),
    );
  }
});

afterEach(() => {
  removeFolder(folder);
});

const sorted = (read: ReturnType<ReturnType<typeof nodeSizeReader>>) =>
  read && { ...read, folders: read.folders.toSorted() };

suite('Reading the sizes in a folder', () => {
  test('adds up the bytes of its files and names the folders in it, going into no link and counting none, with Node', () => {
    const read = nodeSizeReader();

    assert.deepStrictEqual(sorted(read(folder)), {
      bytes: 7,
      folders: [path.join(folder, 'inside')],
    });
    assert.deepStrictEqual(read(path.join(folder, 'inside')), {
      bytes: 100,
      folders: [],
    });
    assert.strictEqual(read(path.join(folder, 'gone')), undefined);
  });

  test.runIf(process.platform === 'win32')(
    'reads the same through NtQueryDirectoryFile on Windows, which reads the size of files the system holds open too',
    () => {
      const load = createRequire(__filename);
      const read = windowsSizeReader(load('koffi'));

      assert.deepStrictEqual(
        sorted(read(folder)),
        sorted(nodeSizeReader()(folder)),
      );
      assert.deepStrictEqual(read(path.join(folder, 'inside')), {
        bytes: 100,
        folders: [],
      });
      assert.strictEqual(read(path.join(folder, 'gone')), undefined);
    },
  );
});
