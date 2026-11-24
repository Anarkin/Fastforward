import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { byteText } from '../../../../../tools/viewer/shared/byteText';
import {
  byteTipAt,
  bytesToAsk,
  hexLine,
  hexRow,
  hexShape,
  offsetDigits,
  withBlankBytes,
} from '../../../../../tools/viewer/page/hex';
import { strings } from '../../../../../lib/shared/strings';
import { maxBytesAsked } from '../../../../../tools/viewer/shared/protocol';

const printable = (byte: number) => byte >= 0x20 && byte <= 0x7e;

suite('Hex rows of a file viewed', () => {
  test('shows the offset, the 16 bytes in two groups of 8, and the printable characters, the sign of the invisible for the rest', () => {
    const bytes = [...Buffer.from('Hello, hex view!')];
    bytes[1] = 0;
    bytes[15] = 0xff;
    assert.deepStrictEqual(hexRow(0x20, bytes, 8), {
      offset: '00000020',
      hex: '48 00 6C 6C 6F 2C 20 68  65 78 20 76 69 65 77 FF',
      text: `H${strings.symbols.invisible}llo, hex view${strings.symbols.invisible}`,
    });
  });

  test('writes a row of hex as one line of cells, three columns between its offset, its bytes and its characters, the offset a piece of its own for its color, and says where its bytes and its characters start', () => {
    const bytes = [...Buffer.from('Hello, hex view!')];

    assert.deepStrictEqual(hexLine(hexRow(0x20, bytes, 8)), {
      text: '00000020   48 65 6C 6C 6F 2C 20 68  65 78 20 76 69 65 77 21   Hello, hex view!',
      bytesAt: 11,
      textAt: 62,
      segments: [
        { text: '00000020', kind: 'offset' },
        {
          text: '   48 65 6C 6C 6F 2C 20 68  65 78 20 76 69 65 77 21   Hello, hex view!',
        },
      ],
    });
  });

  test('names the byte a sign of the invisible stands for among the characters of a row of hex and in the bytes, and nothing for a printable byte, a hex digit or a byte not read', () => {
    const data = [0x41, 0x1b, 0xe9, 0x20];
    const textAt = hexLine(hexRow(0, [], 8)).textAt;
    const hexTip = (column: number, rowStart = 0x10) =>
      byteTipAt(data, 0x10, rowStart, column, textAt, 16);

    assert.deepStrictEqual(
      [
        hexTip(textAt),
        hexTip(textAt + 1),
        hexTip(textAt + 2),
        hexTip(textAt + 3),
        hexTip(textAt + 4),
        hexTip(textAt - 3),
        hexTip(textAt, 0x30),
        byteTipAt(data, 0x10, 0x10, 2, 0, 4),
      ],
      [
        undefined,
        'Byte 0x1B ESCAPE',
        'Byte 0xE9',
        undefined,
        undefined,
        undefined,
        undefined,
        'Byte 0xE9',
      ],
    );
  });

  test('writes a row of hex whose bytes are not read yet as its offset alone', () => {
    assert.deepStrictEqual(hexLine(hexRow(0x20, [], 8), false), {
      text: '00000020',
      bytesAt: 11,
      textAt: 62,
      segments: [{ text: '00000020', kind: 'offset' }],
    });
  });

  test('keeps the columns of a last row shorter than 16 bytes in place', () => {
    assert.deepStrictEqual(hexRow(16, [0x41, 0x42], 8), {
      offset: '00000010',
      hex: `41 42${' '.repeat(43)}`,
      text: 'AB',
    });
  });

  test('gives the offsets as many digits as the size needs, at least 8', () => {
    assert.strictEqual(offsetDigits(100), 8);
    assert.strictEqual(offsetDigits(0xffffffff), 8);
    assert.strictEqual(offsetDigits(0x100000000), 9);
  });

  test('asks for two screens of bytes before the rows shown and three from them, only when what it has does not hold the rows shown', () => {
    assert.deepStrictEqual(bytesToAsk(100, 10, 1_000_000, undefined), {
      start: 80 * 16,
      length: 50 * 16,
    });
    assert.deepStrictEqual(bytesToAsk(5, 10, 1_000_000, undefined), {
      start: 0,
      length: 50 * 16,
    });
    assert.strictEqual(
      bytesToAsk(100, 10, 1_000_000, { start: 80 * 16, length: 50 * 16 }),
      undefined,
    );
    assert.deepStrictEqual(
      bytesToAsk(122, 10, 1_000_000, { start: 80 * 16, length: 50 * 16 }),
      { start: 102 * 16, length: 50 * 16 },
    );
  });

  test('draws a byte alike in the characters of a row of hex and in the bytes of a file, one character a byte: printable ASCII as it is and every other byte the sign of the invisible, so a byte that is a dot is told from one that is not, as the bytes drew the Latin letters of 0xA1 to 0xFF the hex drew as dots, and lit up the padding of binaries as ÿ', () => {
    const { invisible } = strings.symbols;
    const every = Array.from({ length: 256 }, (_, byte) => byte);
    const expected = every
      .map((byte) => (printable(byte) ? String.fromCharCode(byte) : invisible))
      .join('');

    assert.strictEqual(byteText(every), expected);
    assert.strictEqual(
      Array.from(
        { length: 16 },
        (_, row) =>
          hexRow(row * 16, every.slice(row * 16, row * 16 + 16), 8).text,
      ).join(''),
      expected,
    );
    assert.strictEqual(
      byteText([0x41, 0x00, 0x0a, 0x7f, 0x85, 0xa0, 0x2e, 0xe9, 0xff, 0x7e]),
      `A${invisible.repeat(5)}.${invisible.repeat(2)}~`,
    );
  });

  test('marks the bytes of whitespace among the characters of a row while whitespace is shown, a space to be dotted and a tab, a carriage return and a line feed by their signs, and every other byte that is no printable ASCII by the sign of the invisible whether whitespace is shown or not, one character a byte, so the row keeps its columns, and leaves the rest of the row as its pieces were', () => {
    const { symbols } = strings;
    const bytes = [0x61, 0x20, 0x09, 0x0d, 0x0a, 0x00, 0x62];
    const line = hexLine(hexRow(0, bytes, 8));
    const marked = withBlankBytes(line.segments, line.textAt, bytes, true);
    assert.deepStrictEqual(marked, [
      { text: '00000000', kind: 'offset' },
      { text: line.text.slice(8, line.textAt + 1) },
      {
        text: ` ${symbols.tab}${symbols.carriageReturn}${symbols.lineFeed}${symbols.invisible}`,
        blank: true,
      },
      { text: 'b' },
    ]);
    assert.strictEqual(
      marked.map(({ text }) => text).join('').length,
      line.text.length,
    );
    assert.deepStrictEqual(
      withBlankBytes(line.segments, line.textAt, bytes, false).slice(2),
      [{ text: symbols.invisible.repeat(4), blank: true }, { text: 'b' }],
    );
    assert.deepStrictEqual(
      withBlankBytes(
        [{ text: 'a¤a b' }],
        0,
        [0x61, 0x80, 0x61, 0x20, 0x62],
        true,
      ),
      [
        { text: 'a' },
        { text: symbols.invisible, blank: true },
        { text: 'a' },
        { text: ' ', blank: true },
        { text: 'b' },
      ],
    );
    assert.deepStrictEqual(
      withBlankBytes([{ text: 'a.b' }], 0, [0x61, 0x2e, 0x62], false),
      [{ text: 'a.b' }],
    );
  });

  test('asks for no more bytes than the main process reads at once, around the rows shown, holding what it was given while the rows move a little, as rows too wide for five screens of them were asked for again without end, and the row above the screen was blank', () => {
    const size = 10_000_000;
    const answer = (asked: { start: number; length: number }) => ({
      start: asked.start,
      length: Math.max(0, Math.min(asked.length, size - asked.start)),
    });
    for (const [rowBytes, screen] of [
      [200, 66],
      [500, 120],
      [1000, 70],
      [4000, 20],
    ] as const) {
      const rowCount = Math.ceil(size / rowBytes);
      for (const top of [
        0,
        3,
        1000,
        rowCount - screen - 5,
        rowCount - screen,
      ]) {
        const what = `${rowBytes} ${screen} ${top}`;
        const asked = bytesToAsk(top, screen, size, undefined, rowBytes);
        assert.ok(asked, what);
        assert.ok(asked.length <= maxBytesAsked, what);
        assert.strictEqual(asked.start % rowBytes, 0, what);
        const loaded = answer(asked);
        const shownFrom = top * rowBytes;
        const shownTo = Math.min(size, (top + screen + 1) * rowBytes);
        assert.ok(loaded.start <= shownFrom, what);
        assert.ok(
          loaded.start + loaded.length >=
            Math.min(shownTo, shownFrom + maxBytesAsked - rowBytes),
          what,
        );
        assert.strictEqual(
          bytesToAsk(top, screen, size, loaded, rowBytes),
          undefined,
          what,
        );
        if (top > 3 && top < rowCount - screen && rowBytes * screen < 30_000) {
          for (const moved of [top - 1, top + 1]) {
            assert.strictEqual(
              bytesToAsk(moved, screen, size, loaded, rowBytes),
              undefined,
              `${what} ${moved}`,
            );
          }
        }
      }
    }
  });

  test('asks for the bytes of rows as wide as asked', () => {
    assert.deepStrictEqual(bytesToAsk(100, 10, 10_000_000, undefined, 120), {
      start: 80 * 120,
      length: 50 * 120,
    });
  });

  test('selects whole bytes in Hex, pressed in either column and drawn in both, as Find marks them, the selection staying in the column it was pressed in', () => {
    const shape = hexShape;
    const first = rowOf(0x00, 'Hello, hex view!');
    const second = rowOf(0x10, 'second row here.');
    const { bytesAt, textAt } = hexLine(hexRow(0, [...Buffer.from('x')], 8));
    const hexAt = (byte: number) => bytesAt + byte * 3 + (byte >= 8 ? 1 : 0);

    assert.deepStrictEqual(
      [
        shape.placed(first, hexAt(3), undefined),
        shape.placed(first, hexAt(3) + 1, undefined),
        shape.placed(first, hexAt(3) + 2, undefined),
        shape.placed(first, hexAt(9), undefined),
        shape.placed(first, textAt + 5, undefined),
        shape.placed(first, 2, undefined),
        shape.placed(first, hexAt(3), { start: 0, char: textAt }),
        shape.placed(first, textAt + 16, { start: 0, char: bytesAt }),
      ],
      [
        hexAt(3),
        hexAt(3),
        hexAt(4),
        hexAt(9),
        textAt + 5,
        hexAt(0),
        textAt + 3,
        hexAt(15) + 2,
      ],
    );
    const across = {
      anchor: { start: 0x00, char: hexAt(14) },
      focus: { start: 0x10, char: hexAt(2) },
    };
    assert.deepStrictEqual(
      [shape.drawn(across, first), shape.drawn(across, second)],
      [
        [
          { from: hexAt(14), to: hexAt(15) + 2 },
          { from: textAt + 14, to: textAt + 16 },
        ],
        [
          { from: hexAt(0), to: hexAt(1) + 2 },
          { from: textAt, to: textAt + 2 },
        ],
      ],
    );
    assert.deepStrictEqual(
      shape.drawn(
        {
          anchor: { start: 0, char: textAt + 4 },
          focus: { start: 0, char: textAt + 1 },
        },
        first,
      ),
      [
        { from: hexAt(1), to: hexAt(3) + 2 },
        { from: textAt + 1, to: textAt + 4 },
      ],
    );
  });

  test('copies the bytes selected as their hex digits when pressed in the hex column and as their characters in the other, one after another across rows, and seeks their hex digits whichever it was, as copies of the same bytes are marked in both columns', () => {
    const shape = hexShape;
    const rows = [
      rowOf(0x00, 'Hello, hex view!'),
      rowOf(0x10, 'second row here.'),
    ];
    const { bytesAt, textAt } = hexLine(hexRow(0, [...Buffer.from('x')], 8));
    const hexAt = (byte: number) => bytesAt + byte * 3 + (byte >= 8 ? 1 : 0);
    const inHex = {
      anchor: { start: 0x00, char: hexAt(14) },
      focus: { start: 0x10, char: hexAt(2) },
    };
    const inText = {
      anchor: { start: 0x00, char: textAt + 14 },
      focus: { start: 0x10, char: textAt + 2 },
    };

    assert.strictEqual(shape.text(inHex, rows), '77 21 73 65 ');
    assert.strictEqual(
      shape.clip(shape.text(inHex, rows), inHex, rows),
      '77 21 73 65',
    );
    assert.strictEqual(shape.text(inText, rows), 'w!se');
    assert.strictEqual(shape.clip('w!se', inText, rows), 'w!se');
    assert.deepStrictEqual(
      [shape.sought(inHex, rows), shape.sought(inText, rows)],
      ['77217365', '77217365'],
    );
    assert.strictEqual(shape.sought(inHex, rows.slice(1)), undefined);
    assert.strictEqual(
      shape.sought({ anchor: inHex.anchor, focus: inHex.anchor }, rows),
      undefined,
    );
  });

  test('takes the byte a double click is on in the hex column and the word in the other, and the whole row on a third click, in the column clicked', () => {
    const shape = hexShape;
    const row = rowOf(0x20, 'Hello, hex view!');
    const { bytesAt, textAt } = hexLine(hexRow(0, [...Buffer.from('x')], 8));
    const hexAt = (byte: number) => bytesAt + byte * 3 + (byte >= 8 ? 1 : 0);

    assert.deepStrictEqual(
      [
        shape.word(row, hexAt(8) + 1),
        shape.word(row, textAt + 9),
        shape.line(row, hexAt(4)),
        shape.line(row, textAt),
      ],
      [
        {
          anchor: { start: 0x20, char: hexAt(8) },
          focus: { start: 0x20, char: hexAt(9) },
        },
        {
          anchor: { start: 0x20, char: textAt + 7 },
          focus: { start: 0x20, char: textAt + 10 },
        },
        {
          anchor: { start: 0x20, char: hexAt(0) },
          focus: { start: 0x20, char: hexAt(15) + 2 },
        },
        {
          anchor: { start: 0x20, char: textAt },
          focus: { start: 0x20, char: textAt + 16 },
        },
      ],
    );
  });
});

function rowOf(offset: number, text: string) {
  const line = hexLine(hexRow(offset, [...Buffer.from(text)], 8)).text;
  return { start: offset, end: offset + 16, text: line };
}
