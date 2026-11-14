import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  decodedText,
  encodedText,
  type DecodedText,
} from '../../../../../tools/commander/main/textCodec';
import {
  keptPlaceholder,
  type LineEnding,
} from '../../../../../tools/commander/shared/textMarks';
import {
  textEncodings,
  type TextEncoding,
} from '../../../../../tools/commander/shared/protocol';

const bytesOf = (...parts: (string | readonly number[])[]) =>
  Uint8Array.from(
    parts.flatMap((part) =>
      typeof part === 'string'
        ? Array.from(Buffer.from(part, 'latin1'))
        : [...part],
    ),
  );

function writtenBack(read: DecodedText, text = read.text): Uint8Array {
  const written = encodedText({ ...read, text, ending: read.ending ?? 'lf' });
  if (!('bytes' in written)) {
    throw new Error(JSON.stringify(written.unencodable));
  }
  return written.bytes;
}

function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const pieces = [
  [0x0a],
  [0x0d],
  [0x0d, 0x0a],
  [0x0d, 0x0d, 0x0a],
  [0x0a, 0x0d],
  [0x20],
  [0x09],
  [0x61],
  [0x7a],
  [0xc3, 0xa9],
  [0xe2, 0x82, 0xac],
  [0xf0, 0x9f, 0x98, 0x80],
  [0xef, 0xbf, 0xbd],
  [0xef, 0xbb, 0xbf],
  [0xff, 0xfe],
  [0xfe, 0xff],
  [0x00],
  [0x00, 0xd8],
  [0xd8, 0x00],
  [0x00, 0xdc],
  [0xed, 0xa0, 0x80],
  [0xc0, 0xaf],
];

function randomBytes(next: () => number): Uint8Array {
  const length = Math.floor(next() * 40);
  const bytes: number[] = [];
  for (let index = 0; index < length; index++) {
    bytes.push(
      ...(next() < 0.3
        ? [Math.floor(next() * 256)]
        : pieces[Math.floor(next() * pieces.length)]),
    );
  }
  return Uint8Array.from(bytes);
}

const lineBreaks = (encoding: TextEncoding) =>
  encoding === 'utf-16le'
    ? [
        [0x0d, 0x00, 0x0a, 0x00],
        [0x0a, 0x00],
        [0x0d, 0x00],
      ]
    : encoding === 'utf-16be'
      ? [
          [0x00, 0x0d, 0x00, 0x0a],
          [0x00, 0x0a],
          [0x00, 0x0d],
        ]
      : [[0x0d, 0x0a], [0x0a], [0x0d]];

interface ByteLine {
  readonly content: readonly number[];
  readonly ending: readonly number[];
}

function byteLines(bytes: Uint8Array, encoding: TextEncoding): ByteLine[] {
  const breaks = lineBreaks(encoding);
  const unit = encoding.startsWith('utf-16') ? 2 : 1;
  const lines: ByteLine[] = [];
  let content: number[] = [];
  for (let at = 0; at < bytes.length;) {
    const ending = breaks.find((each) =>
      each.every((byte, index) => bytes[at + index] === byte),
    );
    if (ending !== undefined && at % unit === 0) {
      lines.push({ content, ending });
      content = [];
      at += ending.length;
    } else {
      content.push(bytes[at]);
      at += 1;
    }
  }
  lines.push({ content, ending: [] });
  return lines;
}

const boms: Partial<Record<TextEncoding, readonly number[]>> = {
  'utf-8': [0xef, 0xbb, 0xbf],
  'utf-16le': [0xff, 0xfe],
  'utf-16be': [0xfe, 0xff],
};

const encodedAs = (encoding: TextEncoding, text: string) =>
  encoding === 'utf-16le'
    ? Array.from(Buffer.from(text, 'utf16le'))
    : encoding === 'utf-16be'
      ? Array.from(Buffer.from(text, 'utf16le').swap16())
      : Array.from(Buffer.from(text, 'latin1'));

suite('Text of the editor in bytes', () => {
  test('reads a file of UTF-8 as its text, its lines apart by a line feed, and writes the same bytes back', () => {
    const bytes = bytesOf('caf', [0xc3, 0xa9], '\nzwei\n');
    const read = decodedText(bytes, 'utf-8');
    assert.strictEqual(read.text, 'café\nzwei\n');
    assert.strictEqual(read.ending, 'lf');
    assert.deepStrictEqual(read.endings, { lf: 2, crlf: 0, cr: 0 });
    assert.deepStrictEqual(read.strayEndings, []);
    assert.deepStrictEqual(read.keptBytes, []);
    assert.strictEqual(read.bom, false);
    assert.deepStrictEqual(writtenBack(read), bytes);
  });

  test('takes the most common line ending as the one of the file, keeps the lines ending otherwise where they are, and writes each back as it ended', () => {
    const bytes = bytesOf('a\r\nb\r\nc\nd\re\r\n');
    const read = decodedText(bytes, 'utf-8');
    assert.strictEqual(read.text, 'a\nb\nc\nd\ne\n');
    assert.strictEqual(read.ending, 'crlf');
    assert.deepStrictEqual(read.endings, { lf: 1, crlf: 3, cr: 1 });
    assert.deepStrictEqual(read.strayEndings, [
      { at: 5, ending: 'lf' },
      { at: 7, ending: 'cr' },
    ]);
    assert.deepStrictEqual(writtenBack(read), bytes);
  });

  test('has no line ending of its own for a file of one line', () => {
    const read = decodedText(bytesOf('one line'), 'utf-8');
    assert.strictEqual(read.ending, undefined);
    assert.deepStrictEqual(read.endings, { lf: 0, crlf: 0, cr: 0 });
  });

  test('writes the line breaks added with the line ending of the file', () => {
    const read = decodedText(bytesOf('a\r\nb\r\n'), 'utf-8');
    assert.deepStrictEqual(
      writtenBack(read, 'a\nnew\nb\n'),
      bytesOf('a\r\nnew\r\nb\r\n'),
    );
  });

  test('keeps the byte order mark of UTF-8 and UTF-16 out of the text and writes it back', () => {
    for (const [encoding, bytes, text] of [
      ['utf-8', bytesOf([0xef, 0xbb, 0xbf], 'a\n'), 'a\n'],
      ['utf-16le', bytesOf([0xff, 0xfe], [0x61, 0x00, 0x0a, 0x00]), 'a\n'],
      ['utf-16be', bytesOf([0xfe, 0xff], [0x00, 0x61, 0x00, 0x0a]), 'a\n'],
    ] as const) {
      const read = decodedText(bytes, encoding);
      assert.strictEqual(read.text, text, encoding);
      assert.strictEqual(read.bom, true, encoding);
      assert.deepStrictEqual(writtenBack(read), bytes, encoding);
    }
  });

  test('keeps each byte UTF-8 cannot decode as a placeholder of its own, writing the byte back in its place', () => {
    const bytes = bytesOf(
      'caf',
      [0xe9],
      ' ok',
      [0xe2, 0x82],
      '!',
      [0xc0, 0xaf],
    );
    const read = decodedText(bytes, 'utf-8');
    const placeholder = keptPlaceholder;
    assert.strictEqual(
      read.text,
      `caf${placeholder} ok${placeholder}${placeholder}!${placeholder}${placeholder}`,
    );
    assert.deepStrictEqual(read.keptBytes, [
      { at: 3, bytes: [0xe9] },
      { at: 7, bytes: [0xe2] },
      { at: 8, bytes: [0x82] },
      { at: 10, bytes: [0xc0] },
      { at: 11, bytes: [0xaf] },
    ]);
    assert.deepStrictEqual(writtenBack(read), bytes);
  });

  test('reads a replacement character written in the file as itself, and writes it as UTF-8 again', () => {
    const bytes = bytesOf('a', [0xef, 0xbf, 0xbd]);
    const read = decodedText(bytes, 'utf-8');
    assert.strictEqual(read.text, 'a�');
    assert.deepStrictEqual(read.keptBytes, []);
    assert.deepStrictEqual(writtenBack(read), bytes);
  });

  test('keeps the bytes a code page leaves undefined, an odd last byte of UTF-16 and its halves of characters standing alone', () => {
    const thai = bytesOf('a', [0xdb], 'b');
    const readThai = decodedText(thai, 'windows-874');
    assert.deepStrictEqual(readThai.keptBytes, [{ at: 1, bytes: [0xdb] }]);
    assert.deepStrictEqual(writtenBack(readThai), thai);
    const halves = bytesOf([0x61, 0x00, 0x00, 0xd8, 0x62, 0x00, 0x63]);
    const readHalves = decodedText(halves, 'utf-16le');
    assert.strictEqual(
      readHalves.text,
      `a${keptPlaceholder}b${keptPlaceholder}`,
    );
    assert.deepStrictEqual(readHalves.keptBytes, [
      { at: 1, bytes: [0x00, 0xd8] },
      { at: 3, bytes: [0x63] },
    ]);
    assert.deepStrictEqual(writtenBack(readHalves), halves);
  });

  test('writes a placeholder typed over or moved off its byte as the character it is now, and a line break no longer marked as the ending of the file', () => {
    const read = decodedText(bytesOf('x', [0xe9], 'y\nz\r\n'), 'utf-8');
    assert.deepStrictEqual(
      writtenBack({
        ...read,
        keptBytes: [{ at: 0, bytes: [0xe9] }],
        strayEndings: [{ at: 4, ending: 'crlf' }],
      }),
      bytesOf('x', [0xef, 0xbf, 0xbd], 'y\nz\n'),
    );
  });

  test('names the characters an encoding cannot hold and where they are, writing nothing', () => {
    const read = decodedText(bytesOf('a\n'), 'windows-1252');
    assert.deepStrictEqual(
      encodedText({ ...read, text: 'a中\nb😀\n', ending: 'lf' }),
      {
        unencodable: [
          { at: 1, character: '中' },
          { at: 4, character: '😀' },
        ],
      },
    );
  });

  test('writes back every byte of thousands of files of random bytes in every encoding, their line endings mixed, byte order marks and bytes that cannot be decoded, as they were read', () => {
    const next = random(20261113);
    const wrong: string[] = [];
    for (const encoding of textEncodings) {
      for (let round = 0; round < 400; round++) {
        const bom = boms[encoding];
        const bytes = Uint8Array.from([
          ...(bom !== undefined && next() < 0.2 ? bom : []),
          ...randomBytes(next),
        ]);
        const back = writtenBack(decodedText(bytes, encoding));
        if (Buffer.compare(back, bytes) !== 0) {
          wrong.push(`${encoding}: ${Buffer.from(bytes).toString('hex')}`);
        }
      }
    }
    assert.deepStrictEqual(wrong.slice(0, 10), []);
  });

  test('changes only the bytes of the line edited in random files of every encoding, keeping the bytes of every other line, its line ending and the bytes after it', () => {
    const next = random(1113);
    const wrong: string[] = [];
    for (const encoding of textEncodings) {
      for (let round = 0; round < 200; round++) {
        const bytes = randomBytes(next);
        const read = decodedText(bytes, encoding);
        const lines = read.text.split('\n');
        const edited = Math.floor(next() * lines.length);
        const replacement = next() < 0.5 ? '' : 'edited';
        const start = lines
          .slice(0, edited)
          .reduce((at, line) => at + line.length + 1, 0);
        const end = start + lines[edited].length;
        const shift = replacement.length - (end - start);
        const moved = <T extends { readonly at: number }>(
          marks: readonly T[],
        ) =>
          marks.flatMap((mark) =>
            mark.at < start
              ? [mark]
              : mark.at >= end
                ? [{ ...mark, at: mark.at + shift }]
                : [],
          );
        const text =
          read.text.slice(0, start) + replacement + read.text.slice(end);
        const written = encodedText({
          ...read,
          text,
          ending: read.ending ?? 'lf',
          strayEndings: moved(read.strayEndings),
          keptBytes: moved(read.keptBytes),
        });
        const original = byteLines(
          bytes.subarray(
            bytes.length > 0 && read.bom ? (boms[encoding] ?? []).length : 0,
          ),
          encoding,
        );
        const expected = [
          ...(read.bom ? (boms[encoding] ?? []) : []),
          ...original.flatMap((line, index) => [
            ...(index === edited
              ? encodedAs(encoding, replacement)
              : line.content),
            ...line.ending,
          ]),
        ];
        if (
          !('bytes' in written) ||
          Buffer.compare(written.bytes, Uint8Array.from(expected)) !== 0
        ) {
          wrong.push(
            `${encoding}: ${Buffer.from(bytes).toString('hex')} line ${edited}`,
          );
        }
      }
    }
    assert.deepStrictEqual(wrong.slice(0, 10), []);
  });

  test('counts a line break of UTF-16 only on a whole character, never across two', () => {
    const bytes = bytesOf([0x0a, 0x0d, 0x0a, 0x00]);
    const read = decodedText(bytes, 'utf-16le');
    assert.strictEqual(read.text, 'ഊ\n');
    assert.deepStrictEqual(writtenBack(read), bytes);
  });

  test('takes as the line ending of a file whose endings are as common the one it ends its first line with', () => {
    const endings: [string, LineEnding][] = [
      ['a\nb\r\n', 'lf'],
      ['a\r\nb\n', 'crlf'],
    ];
    for (const [text, ending] of endings) {
      assert.strictEqual(decodedText(bytesOf(text), 'utf-8').ending, ending);
    }
  });
});
