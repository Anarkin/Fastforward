import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  blockCache,
  readingFile,
  rowBytes,
  rowStartAt,
  rowsBefore,
  rowsFrom,
  type ReadBytes,
} from '../../../../tools/commander/main/textRows';
import { removeFolder, tempFolder } from '../../../repositories';

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

suite('Rows of text of a file', () => {
  test('splits at line ends, dropping the carriage return of Windows line ends, and gives each row its bytes', async () => {
    const { read, size } = inMemory('one\r\ntwo\n\nthree');

    assert.deepStrictEqual(await rowsFrom(read, size, 0, 10), [
      { start: 0, end: 5, text: 'one' },
      { start: 5, end: 9, text: 'two' },
      { start: 9, end: 10, text: '' },
      { start: 10, end: 15, text: 'three' },
    ]);
    assert.deepStrictEqual(texts(await rowsFrom(read, size, 5, 2)), [
      'two',
      '',
    ]);
  });

  test('breaks a line longer than a row into rows, never inside a character', async () => {
    const line = `${'a'.repeat(rowBytes - 1)}é${'b'.repeat(10)}`;
    const { read, size } = inMemory(`${line}\nnext`);

    const rows = await rowsFrom(read, size, 0, 10);

    assert.deepStrictEqual(texts(rows), [
      'a'.repeat(rowBytes - 1),
      `é${'b'.repeat(10)}`,
      'next',
    ]);
    assert.strictEqual(rows[1]?.start, rowBytes - 1);
  });

  test('reads backwards the rows ending where a row starts, long lines too', async () => {
    const long = 'x'.repeat(rowBytes * 2 + 5);
    const { read, size } = inMemory(`one\ntwo\n${long}\nlast`);
    const forward = await rowsFrom(read, size, 0, 10);
    const lastStart = forward.at(-1)?.start ?? 0;

    const backward = await rowsBefore(read, size, lastStart, 10);

    assert.deepStrictEqual(texts(backward), texts(forward.slice(0, -1)));
    assert.deepStrictEqual(
      backward.map((row) => [row.start, row.end]),
      forward.slice(0, -1).map((row) => [row.start, row.end]),
    );
  });

  test('finds the row any byte is in from a few bytes around it, at the start, the end and within a line', async () => {
    const { read, size } = inMemory('one\ntwo\nthree\n');

    assert.strictEqual(await rowStartAt(read, 0), 0);
    assert.strictEqual(await rowStartAt(read, 2), 0);
    assert.strictEqual(await rowStartAt(read, 4), 4);
    assert.strictEqual(await rowStartAt(read, 6), 4);
    assert.strictEqual(await rowStartAt(read, size), size);
  });

  test('reads only around the place asked for, whatever the size of the file', async () => {
    const lines = Array.from(
      { length: 200_000 },
      (_, index) => `line ${index}`,
    ).join('\n');
    const { read, size, reads } = inMemory(lines);

    const start = await rowStartAt(read, Math.floor(size / 2));
    const rows = await rowsFrom(read, size, start, 40);
    const before = await rowsBefore(read, size, start, 40);

    assert.strictEqual(rows.length, 40);
    assert.strictEqual(before.length, 40);
    assert.ok(
      reads.reduce((sum, length) => sum + length, 0) < 1_000_000,
      String(reads.length),
    );
    assert.strictEqual(before.at(-1)?.end, rows[0]?.start);
  });

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
    await rowsBefore(cached, size, start, 100);
    assert.ok(reads.length > 0 && reads.length <= 3, String(reads.length));
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
