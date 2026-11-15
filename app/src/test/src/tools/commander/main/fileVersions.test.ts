import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  bytesVersion,
  sampledVersion,
} from '../../../../../tools/commander/main/fileVersions';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

const stats = (size: number) => ({
  ino: 0,
  size,
  mtimeMs: 1_767_323_045_000,
  ctimeMs: 1_767_323_045_000,
  birthtimeMs: 1_767_323_045_000,
});

suite('File versions', () => {
  let folder: string;

  beforeEach(() => {
    folder = tempFolder('file-versions');
  });

  afterEach(() => {
    removeFolder(folder);
  });

  const written = (name: string, bytes: Buffer) => {
    const file = path.join(folder, name);
    fs.writeFileSync(file, bytes);
    return file;
  };

  test('tells the bytes of a file apart by their length and hash, alike for alike bytes', () => {
    assert.strictEqual(
      bytesVersion(Buffer.from('aaaa')),
      bytesVersion(Buffer.from('aaaa')),
    );
    assert.notStrictEqual(
      bytesVersion(Buffer.from('aaaa')),
      bytesVersion(Buffer.from('bbbb')),
    );
    assert.notStrictEqual(
      bytesVersion(Buffer.alloc(0)),
      bytesVersion(Buffer.from([0])),
    );
  });

  test('tells files apart by their first and last bytes when the system tells them apart by nothing else, as a FAT drive or a share whose files have no id and the same size and dates', async () => {
    const size = 1024 * 1024;
    const filled = (at: number, byte: number) => {
      const bytes = Buffer.alloc(size, 0x20);
      bytes[at] = byte;
      return bytes;
    };
    const versionOf = (name: string, bytes: Buffer) =>
      sampledVersion(written(name, bytes), stats(size));
    const plain = await versionOf('plain.zip', filled(0, 0x20));
    assert.strictEqual(await versionOf('same.zip', filled(0, 0x20)), plain);
    assert.notStrictEqual(await versionOf('head.zip', filled(0, 0x21)), plain);
    assert.notStrictEqual(
      await versionOf('tail.zip', filled(size - 1, 0x21)),
      plain,
    );
    assert.notStrictEqual(
      await versionOf('end.zip', filled(size - 64 * 1024, 0x21)),
      plain,
    );
  });

  test('tells files apart by their size, id and dates as the system tells them, though their bytes are alike', async () => {
    const file = written('small.txt', Buffer.from('small'));
    const plain = await sampledVersion(file, stats(5));
    for (const changed of [
      { ...stats(5), ino: 7 },
      { ...stats(5), mtimeMs: 1 },
      { ...stats(5), ctimeMs: 1 },
      { ...stats(5), birthtimeMs: 1 },
    ]) {
      assert.notStrictEqual(await sampledVersion(file, changed), plain);
    }
  });

  test('reads a file shorter than what it samples, or empty, whole', async () => {
    const empty = written('empty.txt', Buffer.alloc(0));
    assert.ok((await sampledVersion(empty, stats(0))).length > 0);
    const short = written('short.txt', Buffer.from('abc'));
    const other = written('other.txt', Buffer.from('abd'));
    assert.notStrictEqual(
      await sampledVersion(short, stats(3)),
      await sampledVersion(other, stats(3)),
    );
  });
});
