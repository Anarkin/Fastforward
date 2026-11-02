import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  blockCache,
  codingOf,
  isUtf8,
  utf16Order,
  looksBinary,
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

const cuts = (rows: readonly { readonly cut?: true }[]) =>
  rows.map((row) => row.cut === true);

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

  test('takes a file for binary as git does, when its first 8000 bytes hold a NUL', () => {
    assert.strictEqual(looksBinary(Buffer.from('text, é')), false);
    assert.strictEqual(
      looksBinary(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00])),
      true,
    );
    const late = Buffer.alloc(9000, 0x41);
    late[8500] = 0;
    assert.strictEqual(looksBinary(late), false);
  });

  test('reads UTF-16 of either byte order, a line ending only where a whole unit is one, and its carriage returns dropped', async () => {
    for (const encoding of ['utf-16le', 'utf-16be'] as const) {
      const little = Buffer.from('one\r\n਀two\né\n', 'utf16le');
      const bytes = encoding === 'utf-16le' ? little : little.swap16();
      const { read, size } = inMemory(bytes);
      const coding = codingOf(encoding);

      const rows = await rowsFrom(read, size, 0, 10, coding);

      assert.deepStrictEqual(texts(rows), ['one', '਀two', 'é'], encoding);
      assert.deepStrictEqual(
        rows.map((row) => [row.start, row.end]),
        [
          [0, 10],
          [10, 20],
          [20, 24],
        ],
        encoding,
      );
      assert.deepStrictEqual(
        texts(await rowsBefore(read, size, 20, 10, coding)),
        ['one', '਀two'],
        encoding,
      );
      assert.strictEqual(await rowStartAt(read, 15, coding), 10, encoding);
    }
  });

  test('breaks a long line of UTF-16 between characters, never inside a pair of surrogates', async () => {
    const line = `${'a'.repeat(rowBytes / 2 - 1)}\u{1f600}b`;
    const { read, size } = inMemory(Buffer.from(line, 'utf16le'));

    const rows = await rowsFrom(read, size, 0, 10, codingOf('utf-16le'));

    assert.deepStrictEqual(texts(rows), [
      'a'.repeat(rowBytes / 2 - 1),
      '\u{1f600}b',
    ]);
  });

  test('reads a single byte encoding, every byte a character', async () => {
    const { read, size } = inMemory(Buffer.from([0x8a, 0x61, 0x0a, 0xe8]));

    assert.deepStrictEqual(
      texts(await rowsFrom(read, size, 0, 10, codingOf('windows-1250'))),
      ['Ša', 'č'],
    );
  });

  test('marks each row a line longer than a row is cut into short of its end, read forwards or backwards, from a line start or within the line', async () => {
    const long = 'x'.repeat(rowBytes * 2 + 5);
    const { read, size } = inMemory(`one
${long}
last`);

    const forward = await rowsFrom(read, size, 0, 10);

    assert.deepStrictEqual(cuts(forward), [false, true, true, false, false]);
    assert.deepStrictEqual(
      cuts(await rowsBefore(read, size, forward.at(-1)?.start ?? 0, 10)),
      [false, true, true, false],
    );
    assert.deepStrictEqual(
      cuts(await rowsBefore(read, size, 4 + rowBytes, 10)),
      [false, true],
    );
    assert.deepStrictEqual(cuts(await rowsBefore(read, size, size, 1)), [
      false,
    ]);
  });

  test('marks the row read backwards from within a line longer than it searches back as cut short of its end', async () => {
    const long = 'x'.repeat(2 * 1024 * 1024);
    const { read, size } = inMemory(`${long}
next`);

    const [row] = await rowsBefore(read, size, long.length - 100, 1);

    assert.strictEqual(row?.cut, true);
  });

  test('leaves the line end out of a row read backwards from the end of a line longer than it searches back', async () => {
    const long = 'x'.repeat(2 * 1024 * 1024);
    const { read, size } = inMemory(`${long}\nnext`);

    const [row] = await rowsBefore(read, size, long.length + 1, 1);

    assert.ok(row !== undefined && !row.text.includes('\n'));
    assert.strictEqual(row.end, long.length + 1);
  });

  test('tells UTF-16 without a byte order mark by the zeros of one byte of each pair, as Windows writes its logs, and not a binary file', () => {
    const log = Buffer.from(
      '3/17/2026 23:45:41 - PFRO Error: 0x2\r\n',
      'utf16le',
    );
    assert.strictEqual(utf16Order(log), 'utf-16le');
    assert.strictEqual(utf16Order(Buffer.from(log).swap16()), 'utf-16be');
    assert.strictEqual(
      utf16Order(Buffer.from('Árvíztűrő tükörfúrógép', 'utf16le')),
      'utf-16le',
    );
    assert.strictEqual(
      utf16Order(Buffer.from('plain text', 'utf8')),
      undefined,
    );
    assert.strictEqual(
      utf16Order(Buffer.from([0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0x7f, 0x45])),
      undefined,
    );
  });

  test('tells UTF-8 from the bytes of other encodings, a character cut off at the end of what was read still UTF-8', () => {
    assert.strictEqual(isUtf8(Buffer.from('árvíztűrő', 'utf8')), true);
    assert.strictEqual(isUtf8(Buffer.from([0x61, 0xe1, 0x72, 0x76])), false);
    assert.strictEqual(isUtf8(Buffer.from('a€', 'utf8').subarray(0, 3)), true);
    assert.strictEqual(isUtf8(Buffer.from([0x61, 0xe2, 0x82, 0x41])), false);
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
