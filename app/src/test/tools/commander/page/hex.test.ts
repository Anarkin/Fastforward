import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  bytesToAsk,
  hexRow,
  offsetDigits,
} from '../../../../tools/commander/page/hex';

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
});
