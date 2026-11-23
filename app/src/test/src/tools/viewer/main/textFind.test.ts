import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { findInFile } from '../../../../../tools/viewer/main/textFind';
import { plainSearch } from '../../../../../lib/shared/searchOptions';
import type { ReadBytes } from '../../../../../lib/main/fileBlocks';

function inMemory(bytes: Buffer): { read: ReadBytes; size: number } {
  return {
    read: (position, length) =>
      Promise.resolve(
        bytes.subarray(position, Math.min(bytes.length, position + length)),
      ),
    size: bytes.length,
  };
}

suite('Finding text in a file viewed', () => {
  test('finds every match ignoring case, as the diff does, giving the bytes each takes in UTF-8', async () => {
    const { read, size } = inMemory(Buffer.from('Árvíz ÁRVÍZ árvíz', 'utf8'));

    const found = await findInFile(read, size, 'árvíz', plainSearch, 'utf-8');

    assert.deepStrictEqual(found?.matches, [
      { start: 0, end: 7 },
      { start: 8, end: 15 },
      { start: 16, end: 23 },
    ]);
    assert.strictEqual(found?.capped, false);
  });

  test('finds a match cut by the end of a chunk once, never splitting a character between chunks', async () => {
    const text = 'xx é match xx match é xx match';
    const { read, size } = inMemory(Buffer.from(text, 'utf8'));
    const whole = await findInFile(read, size, 'match', plainSearch, 'utf-8');

    for (const chunk of [1, 2, 3, 4, 5, 7]) {
      assert.deepStrictEqual(
        (await findInFile(read, size, 'match', plainSearch, 'utf-8', { chunk }))
          ?.matches,
        whole?.matches,
        String(chunk),
      );
    }
    assert.deepStrictEqual(
      (await findInFile(read, size, 'é m', plainSearch, 'utf-8', { chunk: 3 }))
        ?.matches,
      [{ start: 3, end: 7 }],
    );
  });

  test('gives the bytes of matches after bytes that are not UTF-8 by the bytes each replaced character stood for, as each was counted as the three bytes of the character replacing it', async () => {
    const { read, size } = inMemory(
      Buffer.concat([
        Buffer.from('caf'),
        Buffer.from([0xe9, 0xe9, 0xe9, 0xe9, 0xf0, 0x9f, 0x98]),
        Buffer.from(' é needle', 'utf8'),
      ]),
    );

    const found = await findInFile(read, size, 'needle', plainSearch, 'utf-8');

    assert.deepStrictEqual(found?.matches, [{ start: 14, end: 20 }]);
  });

  test('gives the bytes of matches in UTF-16 and in a code page of a byte a character', async () => {
    const little = inMemory(Buffer.from('ab Ő ab', 'utf16le'));
    assert.deepStrictEqual(
      (
        await findInFile(
          little.read,
          little.size,
          'ő a',
          plainSearch,
          'utf-16le',
          {
            chunk: 3,
          },
        )
      )?.matches,
      [{ start: 6, end: 12 }],
    );
    const big = inMemory(Buffer.from('ab Ő ab', 'utf16le').swap16());
    assert.deepStrictEqual(
      (await findInFile(big.read, big.size, 'AB', plainSearch, 'utf-16be'))
        ?.matches,
      [
        { start: 0, end: 4 },
        { start: 10, end: 14 },
      ],
    );
    const codePage = inMemory(Buffer.from([0x61, 0xe8, 0x20, 0xc8, 0x62]));
    assert.deepStrictEqual(
      (
        await findInFile(
          codePage.read,
          codePage.size,
          'č',
          plainSearch,
          'windows-1250',
        )
      )?.matches,
      [
        { start: 1, end: 2 },
        { start: 3, end: 4 },
      ],
    );
  });

  test('gives the bytes of matches in UTF-16 after its byte order mark, in every chunk, as the mark left out of the text put each match 2 bytes early', async () => {
    for (const encoding of ['utf-16le', 'utf-16be'] as const) {
      const little = Buffer.from('﻿abc needle', 'utf16le');
      const bytes = encoding === 'utf-16le' ? little : little.swap16();
      const { read, size } = inMemory(bytes);

      for (const chunk of [4, 1024]) {
        assert.deepStrictEqual(
          (
            await findInFile(read, size, 'needle', plainSearch, encoding, {
              chunk,
            })
          )?.matches,
          [{ start: 10, end: 22 }],
          `${encoding} ${chunk}`,
        );
      }
    }
  });

  test('stops at the most matches the diff finds, saying it stopped', async () => {
    const { read, size } = inMemory(Buffer.from('a'.repeat(30)));

    const found = await findInFile(read, size, 'a', plainSearch, 'utf-8', {
      limit: 10,
    });

    assert.strictEqual(found?.matches.length, 10);
    assert.strictEqual(found?.capped, true);
  });

  test('tells what it found so far after each chunk, and stops once called off', async () => {
    const { read, size } = inMemory(Buffer.from('ab '.repeat(10)));
    const told: number[] = [];
    const leaving = new AbortController();

    const found = await findInFile(read, size, 'ab', plainSearch, 'utf-8', {
      chunk: 6,
      signal: leaving.signal,
      onChunk: (matches) => {
        told.push(matches.length);
        if (matches.length >= 4) {
          leaving.abort();
        }
      },
    });

    assert.deepStrictEqual(told, [2, 4]);
    assert.strictEqual(found, undefined);
  });

  test('ends at the end of the file once it is shorter than it was when the find began, as a file cut short meanwhile kept the find reading nothing for ever', async () => {
    const { read } = inMemory(Buffer.from('xx match xx', 'utf8'));

    for (const chunk of [3, 1024]) {
      const calledOff = new AbortController();
      let reads = 0;
      const counted: typeof read = (position, length) => {
        reads++;
        if (reads > 50) {
          calledOff.abort();
        }
        return read(position, length);
      };
      const found = await findInFile(
        counted,
        5000,
        'match',
        plainSearch,
        'utf-8',
        {
          chunk,
          signal: calledOff.signal,
        },
      );
      assert.deepStrictEqual(
        found?.matches,
        [{ start: 3, end: 8 }],
        `${chunk}`,
      );
    }
  });

  test('finds nothing for an empty query', async () => {
    const { read, size } = inMemory(Buffer.from('abc'));

    assert.deepStrictEqual(
      await findInFile(read, size, '', plainSearch, 'utf-8'),
      {
        matches: [],
        capped: false,
      },
    );
  });
});

const wholeWord = { ...plainSearch, wholeWord: true };
const regex = { ...plainSearch, regex: true };

const everyChunk = async (
  text: string,
  query: string,
  options: typeof plainSearch,
  encoding: Parameters<typeof findInFile>[4],
) => {
  const bytes =
    encoding === 'utf-16le'
      ? Buffer.from(text, 'utf16le')
      : Buffer.from(text, 'utf8');
  const { read, size } = inMemory(bytes);
  const whole = (await findInFile(read, size, query, options, encoding))
    ?.matches;
  for (const chunk of [1, 2, 3, 4, 5, 6, 7, 9, 13]) {
    assert.deepStrictEqual(
      (await findInFile(read, size, query, options, encoding, { chunk }))
        ?.matches,
      whole,
      `${query} in chunks of ${chunk}`,
    );
  }
  return whole;
};

suite('Finding text in a file viewed, with options', () => {
  test('keeps whole words whole across the edges of the slices it reads, a letter before a match in the slice before it counting', async () => {
    assert.deepStrictEqual(
      await everyChunk(
        'amatch match matchb match',
        'match',
        wholeWord,
        'utf-8',
      ),
      [
        { start: 7, end: 12 },
        { start: 20, end: 25 },
      ],
    );
    assert.deepStrictEqual(
      await everyChunk('ématch match', 'match', wholeWord, 'utf-8'),
      [{ start: 8, end: 13 }],
    );
    assert.deepStrictEqual(
      await everyChunk('őmatch match', 'match', wholeWord, 'utf-16le'),
      [{ start: 14, end: 24 }],
    );
  });

  test('matches the case when asked, giving the bytes each match takes', async () => {
    assert.deepStrictEqual(
      await everyChunk(
        'Árvíz ÁRVÍZ árvíz',
        'ÁRVÍZ',
        { ...plainSearch, caseSensitive: true },
        'utf-8',
      ),
      [{ start: 8, end: 15 }],
    );
  });

  test('matches a regular expression within a line, its anchors at the ends of lines, never across a line break or at the edge of a slice inside a line', async () => {
    const text = 'one\nneedle two\r\nthree needle\nxxneedle\n';
    assert.deepStrictEqual(await everyChunk(text, '^needle', regex, 'utf-8'), [
      { start: 4, end: 10 },
    ]);
    assert.deepStrictEqual(await everyChunk(text, 'needle$', regex, 'utf-8'), [
      { start: 22, end: 28 },
      { start: 31, end: 37 },
    ]);
    assert.deepStrictEqual(
      await everyChunk(text, String.raw`o\s+n`, regex, 'utf-8'),
      [],
    );
    assert.deepStrictEqual(
      await everyChunk(text, String.raw`n\w+e\b`, regex, 'utf-8'),
      [
        { start: 4, end: 10 },
        { start: 22, end: 28 },
        { start: 31, end: 37 },
      ],
    );
    assert.deepStrictEqual(
      await everyChunk(text, String.raw`^\w+ needle$`, regex, 'utf-16le'),
      [{ start: 32, end: 56 }],
    );
  });

  test('ends a slice a regular expression is matched in at a carriage return no line feed follows too, as at a line feed, so a match that looks back into its line is found in a file of such lines larger than a slice reaches', async () => {
    const line = 'abcdef\r';
    const lines = 12_000;
    const { read, size } = inMemory(Buffer.from(line.repeat(lines)));

    const found = await findInFile(read, size, '(?<=abc)d', regex, 'utf-8', {
      chunk: 1000,
      limit: lines * 2,
    });

    assert.strictEqual(found?.matches.length, lines);
    assert.ok(
      found.matches.every(({ start }) => start % line.length === 3),
      'every match on the d of its line',
    );
  });

  test('finds nothing for a regular expression that is not valid', async () => {
    const { read, size } = inMemory(Buffer.from('(a)'));
    assert.deepStrictEqual(
      (await findInFile(read, size, '(', regex, 'utf-8'))?.matches,
      [],
    );
  });
});
