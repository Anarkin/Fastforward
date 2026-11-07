import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  byteText,
  bytesToAsk,
  hexRow,
  offsetDigits,
} from '../../../../tools/commander/page/hex';
import { maxBytesAsked } from '../../../../tools/commander/shared/protocol';

suite('Hex rows of a file viewed', () => {
  test('shows the offset, the 16 bytes in two groups of 8, and the printable characters, a dot for the rest', () => {
    const bytes = [...Buffer.from('Hello, hex view!')];
    bytes[1] = 0;
    bytes[15] = 0xff;
    assert.deepStrictEqual(hexRow(0x20, bytes, 8), {
      offset: '00000020',
      hex: '48 00 6C 6C 6F 2C 20 68  65 78 20 76 69 65 77 FF',
      text: 'H.llo, hex view.',
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

  test('shows the bytes of a binary file as text one byte to a character, Latin-1 as it is, a dot for what has no glyph', () => {
    assert.strictEqual(
      byteText([0x41, 0x00, 0x0a, 0x7f, 0x85, 0xa0, 0xad, 0xe9, 0xff, 0x7e]),
      'A......éÿ~',
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
});
