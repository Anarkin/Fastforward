import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  byteOrderMarkOf,
  markBytesOf,
  markCharacter,
  startsWithMark,
  withoutMark,
} from '../../../../../components/encodings/shared/byteOrderMarks';

const bytes = (...values: number[]) => new Uint8Array(values);

suite('Byte order marks', () => {
  test('gives the bytes of the mark of UTF-8 and UTF-16, and none for an encoding that has none', () => {
    assert.deepStrictEqual(markBytesOf('utf-8'), [0xef, 0xbb, 0xbf]);
    assert.deepStrictEqual(markBytesOf('utf-16le'), [0xff, 0xfe]);
    assert.deepStrictEqual(markBytesOf('utf-16be'), [0xfe, 0xff]);
    assert.strictEqual(markBytesOf('windows-1252'), undefined);
  });

  test('tells the encoding bytes open with the mark of, and whether they open with the mark of an encoding, never from a part of one', () => {
    assert.strictEqual(byteOrderMarkOf(bytes(0xef, 0xbb, 0xbf, 0x61)), 'utf-8');
    assert.strictEqual(byteOrderMarkOf(bytes(0xff, 0xfe, 0x61, 0)), 'utf-16le');
    assert.strictEqual(byteOrderMarkOf(bytes(0xfe, 0xff, 0, 0x61)), 'utf-16be');
    assert.strictEqual(byteOrderMarkOf(bytes(0xef, 0xbb)), undefined);
    assert.strictEqual(byteOrderMarkOf(bytes(0x61)), undefined);
    assert.strictEqual(startsWithMark(bytes(0xef, 0xbb, 0xbf), 'utf-8'), true);
    assert.strictEqual(
      startsWithMark(bytes(0xef, 0xbb, 0xbf), 'utf-16le'),
      false,
    );
    assert.strictEqual(startsWithMark(bytes(0xef, 0xbb), 'utf-8'), false);
    assert.strictEqual(startsWithMark(bytes(0x61), 'windows-1252'), false);
  });

  test('strips the mark from the start of a text decoded, and only from its start', () => {
    assert.strictEqual(withoutMark(`${markCharacter}{}`), '{}');
    assert.strictEqual(withoutMark(`{${markCharacter}}`), `{${markCharacter}}`);
    assert.strictEqual(withoutMark(''), '');
    assert.strictEqual(markCharacter.codePointAt(0), 0xfe_ff);
  });
});
