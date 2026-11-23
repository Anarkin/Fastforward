import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  decodedText,
  encodingOf,
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

  test('reads a file in the encoding its byte order mark names, then UTF-16 told by its zeros, then UTF-8, then the code page of the system, and takes it for binary only when none of them reads it and it holds a NUL, so every tool reads a file alike', () => {
    const utf16 = Buffer.from('a\r\nb', 'utf16le');
    assert.deepStrictEqual(
      [
        encodingOf(Buffer.from([0xef, 0xbb, 0xbf, 0x61]), 'windows-1252'),
        encodingOf(
          Buffer.concat([Buffer.from([0xff, 0xfe]), utf16]),
          'windows-1252',
        ),
        encodingOf(utf16, 'windows-1252'),
        encodingOf(Buffer.from('café'), 'windows-1252'),
        encodingOf(Buffer.from([0x63, 0x61, 0x66, 0xe9]), 'windows-1252'),
        encodingOf(
          Buffer.from([
            0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00,
          ]),
          'windows-1252',
        ),
      ],
      ['utf-8', 'utf-16le', 'utf-16le', 'utf-8', 'windows-1252', undefined],
    );
  });

  test('decodes the text of a file in the encoding it is read in, its byte order mark left out, and none of a binary file', () => {
    assert.deepStrictEqual(
      [
        decodedText(
          Buffer.concat([
            Buffer.from([0xff, 0xfe]),
            Buffer.from('é\n', 'utf16le'),
          ]),
          'windows-1252',
        ),
        decodedText(Buffer.from([0xef, 0xbb, 0xbf, 0x61]), 'windows-1252'),
        decodedText(Buffer.from([0x63, 0x61, 0x66, 0xe9]), 'windows-1252'),
        decodedText(Buffer.from([0x00, 0x01]), 'windows-1252'),
      ],
      [
        { text: 'é\n', encoding: 'utf-16le', bom: true },
        { text: 'a', encoding: 'utf-8', bom: true },
        { text: 'café', encoding: 'windows-1252', bom: false },
        undefined,
      ],
    );
  });
});
