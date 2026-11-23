import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { decodedSides } from '../../../../../tools/diff/main/decodedSides';
import { tempFolder } from '../../../../helpers/tempFolders';

const codePage = () => Promise.resolve('windows-1252' as const);

suite('Sides of a diff read in their encodings', () => {
  test('compares a file of UTF-16 or of the code page of the system by a copy of its text in UTF-8, made once for the same bytes, naming its encoding, and leaves a file of UTF-8 and a binary file as they are', async () => {
    const folder = tempFolder('decoded-sides');
    const copies = path.join(folder, 'copies');
    const utf16 = path.join(folder, 'wide.txt');
    const latin = path.join(folder, 'latin.txt');
    const plain = path.join(folder, 'plain.txt');
    const binary = path.join(folder, 'data.bin');
    fs.writeFileSync(
      utf16,
      Buffer.concat([
        Buffer.from([0xff, 0xfe]),
        Buffer.from('café\r\n', 'utf16le'),
      ]),
    );
    fs.writeFileSync(latin, Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]));
    fs.writeFileSync(plain, 'café\n');
    fs.writeFileSync(binary, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]));

    const decoded = await decodedSides(
      { old: utf16, new: latin },
      copies,
      codePage,
    );
    const again = await decodedSides(
      { old: utf16, new: plain },
      copies,
      codePage,
    );
    const left = await decodedSides(
      { old: plain, new: binary },
      copies,
      codePage,
    );

    assert.deepStrictEqual(
      {
        texts: [decoded.read.old, decoded.read.new].map((file) =>
          fs.readFileSync(file, 'utf8'),
        ),
        names: [decoded.read.old, decoded.read.new].map((file) =>
          path.basename(file),
        ),
        inCopies: [decoded.read.old, decoded.read.new].every((file) =>
          file.startsWith(copies),
        ),
        encodings: decoded.encodings,
      },
      {
        texts: ['café\r\n', 'café\n'],
        names: ['wide.txt', 'latin.txt'],
        inCopies: true,
        encodings: { old: 'utf-16le', new: 'windows-1252' },
      },
    );
    assert.deepStrictEqual(again, {
      read: { old: decoded.read.old, new: plain },
      encodings: { old: 'utf-16le' },
    });
    assert.deepStrictEqual(left, {
      read: { old: plain, new: binary },
      encodings: {},
    });
  });
});
