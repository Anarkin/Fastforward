import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  isUtf8,
  utf16Order,
  looksBinary,
} from '../../../../../components/encodings/main/encodingDetection';

suite('The encoding of a file', () => {
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
});
