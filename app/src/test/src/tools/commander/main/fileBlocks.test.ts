import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  rowStartAt,
  rowsBefore,
  rowsFrom,
} from '../../../../../tools/commander/main/textRows';
import {
  blockCache,
  readingFile,
  type ReadBytes,
} from '../../../../../tools/commander/main/fileBlocks';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

function inMemory(text: string | Buffer): {
  readonly read: ReadBytes;
  readonly size: number;
  readonly reads: number[];
} {
  const bytes = typeof text === 'string' ? Buffer.from(text) : text;
  const reads: number[] = [];
  return {
    read: (position, length) => {
      reads.push(length);
      return Promise.resolve(
        bytes.subarray(position, Math.min(bytes.length, position + length)),
      );
    },
    size: bytes.length,
    reads,
  };
}

const texts = (rows: readonly { readonly text: string }[]) =>
  rows.map((row) => row.text);

suite('Blocks of a file', () => {
  test('reads each block of the file once, however many rows are read from it, until told to forget them', async () => {
    const lines = Array.from(
      { length: 200_000 },
      (_, index) => `line ${index}`,
    ).join('\n');
    const { read, size, reads } = inMemory(lines);
    const cache = blockCache();
    const cached = cache.reader(read);
    const start = await rowStartAt(cached, Math.floor(size / 2));

    const before = await rowsBefore(cached, size, start, 100);
    const after = await rowsFrom(cached, size, start, 150);

    assert.deepStrictEqual(
      texts([...before, ...after]),
      texts([
        ...(await rowsBefore(read, size, start, 100)),
        ...(await rowsFrom(read, size, start, 150)),
      ]),
    );
    reads.length = 0;
    await rowsBefore(cached, size, start, 100);
    assert.strictEqual(reads.length, 0);
    cache.forget();
    await rowsBefore(cache.reader(read), size, start, 100);
    assert.ok(reads.length > 0 && reads.length <= 3, String(reads.length));
  });

  test('keeps the blocks a read through the file as it was finds once told to forget them out of those read since, as a read under way while the file was replaced mixed the old bytes into the new file', async () => {
    const old = inMemory('old line\n'.repeat(20_000));
    const replaced = inMemory('new line\n'.repeat(20_000));
    const cache = blockCache();
    const before = cache.reader(old.read);

    cache.forget();
    await before(100_000, 9);
    const after = await cache.reader(replaced.read)(100_008, 9);

    assert.strictEqual(after.toString(), 'new line\n');
  });

  test('hands out a read within one block as a view of the block it holds rather than a copy, as the rows of a screen read a few bytes at a time and copying the whole block each time made dragging the scrollbar of a file slow', async () => {
    const { read } = inMemory('x'.repeat(200_000));
    const cached = blockCache().reader(read);

    const first = await cached(10, 5);
    const second = await cached(4000, 5);
    const across = await cached(65_530, 12);

    assert.strictEqual(first.toString(), 'xxxxx');
    assert.strictEqual(first.buffer, second.buffer);
    assert.strictEqual(second.byteOffset - first.byteOffset, 3990);
    assert.strictEqual(across.toString(), 'x'.repeat(12));
  });

  test('reads a file on disk', async () => {
    const folder = tempFolder('text-rows');
    try {
      const file = path.join(folder, 'notes.txt');
      fs.writeFileSync(file, 'first\nsecond\n');
      assert.deepStrictEqual(
        texts(await readingFile(file, (read) => rowsFrom(read, 13, 0, 5))),
        ['first', 'second'],
      );
    } finally {
      removeFolder(folder);
    }
  });
});
