import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  rowBytes,
  rowStartAt,
  rowsBefore,
  rowsFrom,
} from '../../../../../tools/viewer/main/textRows';
import { codingOf } from '../../../../../components/encodings/main/textCodings';
import type { ReadBytes } from '../../../../../lib/main/fileBlocks';
import { wholeLineBytes } from '../../../../../tools/viewer/shared/protocol';

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

const spans = (rows: readonly { start: number; end: number }[]) =>
  rows.map((row) => [row.start, row.end]);

suite('Rows of text of a file', () => {
  test('splits at line ends, keeping the carriage return of Windows line ends as the diff does, so whitespace shown marks it, signing the line feed of each line that has one, the last line of a file without one left unsigned, read forwards and backwards alike, and gives each row its bytes', async () => {
    const { read, size } = inMemory('one\r\ntwo\n\nthree');
    const rows = [
      { start: 0, end: 5, text: 'one\r', ending: '␊' },
      { start: 5, end: 9, text: 'two', ending: '␊' },
      { start: 9, end: 10, text: '', ending: '␊' },
      { start: 10, end: 15, text: 'three' },
    ];

    assert.deepStrictEqual(await rowsFrom(read, size, 0, 10), rows);
    assert.deepStrictEqual(await rowsBefore(read, size, size, 10), rows);
    assert.deepStrictEqual(texts(await rowsFrom(read, size, 5, 2)), [
      'two',
      '',
    ]);
  });

  test('breaks a line longer than it keeps whole into rows, never inside a character', async () => {
    const line = `${'a'.repeat(rowBytes - 1)}é${'b'.repeat(wholeLineBytes)}`;
    const { read, size } = inMemory(`${line}\nnext`);

    const rows = await rowsFrom(read, size, 0, 100);

    assert.deepStrictEqual(texts(rows).slice(0, 2), [
      'a'.repeat(rowBytes - 1),
      `é${'b'.repeat(rowBytes - 1)}`,
    ]);
    assert.strictEqual(rows[1]?.start, rowBytes - 1);
    assert.strictEqual(texts(rows).join(''), `${line}next`);
  });

  test('keeps a line of up to 64 KiB whole, as the diff shows it, read forwards or backwards, from its start or from within it', async () => {
    const long = `${'x'.repeat(wholeLineBytes - 6)} last`;
    const { read, size } = inMemory(`one\n${long}\ntwo\n`);
    const end = 4 + long.length + 1;

    assert.strictEqual(
      new TextEncoder().encode(long).length,
      wholeLineBytes - 1,
    );
    assert.deepStrictEqual(texts(await rowsFrom(read, size, 0, 10)), [
      'one',
      long,
      'two',
    ]);
    for (const within of [4, 4 + rowBytes + 7, end - 2]) {
      assert.strictEqual(await rowStartAt(read, within), 4, String(within));
    }
    assert.deepStrictEqual(texts(await rowsBefore(read, size, end, 10)), [
      'one',
      long,
    ]);
    assert.deepStrictEqual(spans(await rowsBefore(read, size, end, 1)), [
      [4, end],
    ]);
  });

  test('stops reading rows once those read hold the bytes asked for, after the rows asked for at least, forwards and backwards', async () => {
    const line = 'x'.repeat(9999);
    const { read, size } = inMemory(`${line}\n`.repeat(100));
    const budget = { least: 3, bytes: 25_000 };

    assert.strictEqual(
      (await rowsFrom(read, size, 0, 100, undefined, budget)).length,
      3,
    );
    assert.strictEqual(
      (await rowsBefore(read, size, size, 100, undefined, budget)).length,
      3,
    );
    assert.strictEqual(
      (await rowsFrom(read, size, 0, 100, undefined, { ...budget, least: 5 }))
        .length,
      5,
    );
    assert.strictEqual(
      (await rowsFrom(read, size, 0, 2, undefined, budget)).length,
      2,
    );
  });

  test('reads backwards the rows ending where a row starts, long lines too', async () => {
    const long = 'x'.repeat(wholeLineBytes + rowBytes * 2 + 5);
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

  test('reads UTF-16 of either byte order, a line ending only where a whole unit is one, and its carriage returns kept', async () => {
    for (const encoding of ['utf-16le', 'utf-16be'] as const) {
      const little = Buffer.from('one\r\n਀two\né\n', 'utf16le');
      const bytes = encoding === 'utf-16le' ? little : little.swap16();
      const { read, size } = inMemory(bytes);
      const coding = codingOf(encoding);

      const rows = await rowsFrom(read, size, 0, 10, coding);

      assert.deepStrictEqual(texts(rows), ['one\r', '਀two', 'é'], encoding);
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
        ['one\r', '਀two'],
        encoding,
      );
      assert.strictEqual(await rowStartAt(read, 15, coding), 10, encoding);
    }
  });

  test('breaks a long line of UTF-16 between characters, never inside a pair of surrogates', async () => {
    const line = `${'a'.repeat(rowBytes / 2 - 1)}\u{1f600}${'b'.repeat(wholeLineBytes)}`;
    const { read, size } = inMemory(Buffer.from(line, 'utf16le'));

    const rows = await rowsFrom(read, size, 0, 100, codingOf('utf-16le'));

    assert.deepStrictEqual(texts(rows).slice(0, 2), [
      'a'.repeat(rowBytes / 2 - 1),
      `\u{1f600}${'b'.repeat(rowBytes / 2 - 1)}`,
    ]);
  });

  test('reads a single byte encoding, every byte a character', async () => {
    const { read, size } = inMemory(Buffer.from([0x8a, 0x61, 0x0a, 0xe8]));

    assert.deepStrictEqual(
      texts(await rowsFrom(read, size, 0, 10, codingOf('windows-1250'))),
      ['Ša', 'č'],
    );
  });

  test('cuts a line longer than it keeps whole at the same places wherever it is read from, at each multiple of the bytes of a row in the file, so its rows stay as they are while more of them are read', async () => {
    const long = 'x'.repeat(wholeLineBytes + rowBytes * 3 + 100);
    const { read, size } = inMemory(`one\n${long}\nlast`);
    const forward = await rowsFrom(read, size, 0, 100);
    const multiples = Array.from(
      { length: Math.floor((long.length + 4) / rowBytes) },
      (_, index) => (index + 1) * rowBytes,
    );

    assert.deepStrictEqual(spans(forward), [
      [0, 4],
      ...[4, ...multiples].map((start, index) => [
        start,
        multiples[index] ?? long.length + 5,
      ]),
      [long.length + 5, size],
    ]);
    for (const byte of [
      5,
      rowBytes - 1,
      rowBytes + 7,
      wholeLineBytes + rowBytes * 3 + 50,
    ]) {
      const start = await rowStartAt(read, byte);
      const index = forward.findIndex((row) => row.start === start);
      assert.ok(
        index !== -1 && (forward[index]?.end ?? 0) > byte,
        String(byte),
      );
      assert.deepStrictEqual(
        spans(await rowsFrom(read, size, start, 100)),
        spans(forward.slice(index)),
      );
      assert.deepStrictEqual(
        spans(await rowsBefore(read, size, start, 100)),
        spans(forward.slice(0, index)),
      );
    }
  });

  test('keeps a short line whole where it crosses a multiple of the bytes of a row', async () => {
    const first = 'x'.repeat(rowBytes - 10);
    const { read, size } = inMemory(`${first}\na line across the multiple\n`);

    const rows = await rowsFrom(read, size, 0, 10);

    assert.deepStrictEqual(texts(rows), [first, 'a line across the multiple']);
    assert.strictEqual(await rowStartAt(read, rowBytes + 2), first.length + 1);
  });

  test('marks each row a line longer than it keeps whole is cut into short of its end, read forwards or backwards, from a line start or within the line', async () => {
    const long = 'x'.repeat(wholeLineBytes + rowBytes * 2 + 5);
    const { read, size } = inMemory(`one
${long}
last`);

    const forward = await rowsFrom(read, size, 0, 100);
    const pieces = forward.length - 2;

    assert.deepStrictEqual(cuts(forward), [
      false,
      ...Array.from({ length: pieces - 1 }, () => true),
      false,
      false,
    ]);
    assert.deepStrictEqual(
      cuts(await rowsBefore(read, size, forward.at(-1)?.start ?? 0, 100)),
      [false, ...Array.from({ length: pieces - 1 }, () => true), false],
    );
    assert.deepStrictEqual(
      cuts(await rowsBefore(read, size, 4 + rowBytes, 10)),
      [false, true, true],
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
});
