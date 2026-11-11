import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { hashOf } from '../../../../tools/commander/main/contentHash';
import { removeFolder, tempFolder } from '../../../repositories';

let folder = '';
const at = (name: string) => path.join(folder, name);
const head = 64 * 1024;

beforeAll(() => {
  folder = tempFolder('content-hash');
  const start = Buffer.alloc(head, 'a');
  fs.writeFileSync(at('one.bin'), Buffer.concat([start, Buffer.from('end')]));
  fs.writeFileSync(at('copy.bin'), Buffer.concat([start, Buffer.from('end')]));
  fs.writeFileSync(at('other.bin'), Buffer.concat([start, Buffer.from('END')]));
  fs.linkSync(at('one.bin'), at('link.bin'));
  fs.writeFileSync(at('small.txt'), 'small');
});

afterAll(() => removeFolder(folder));

suite('Hashing the content of a file', () => {
  test('gives files of the same content the same hash and copies identities of their own, a hard link the identity of the file it links', () => {
    const one = hashOf(at('one.bin'), undefined);
    const copy = hashOf(at('copy.bin'), undefined);
    const link = hashOf(at('link.bin'), undefined);
    assert.deepStrictEqual(
      [
        one.hash === copy.hash,
        one.id === copy.id,
        one.id === link.id,
        one.size,
      ],
      [true, false, true, head + 3],
    );
  });

  test('hashes as many bytes from the start as asked, so files that part only after them hash alike, and the whole file when asked for none', () => {
    assert.strictEqual(
      hashOf(at('one.bin'), head).hash,
      hashOf(at('other.bin'), head).hash,
    );
    assert.notStrictEqual(
      hashOf(at('one.bin'), undefined).hash,
      hashOf(at('other.bin'), undefined).hash,
    );
  });

  test('hashes a file no longer than the start asked for as a whole, so its start stands for all of it', () => {
    assert.strictEqual(
      hashOf(at('small.txt'), head).hash,
      hashOf(at('small.txt'), undefined).hash,
    );
  });

  test('throws for a file it cannot open', () => {
    assert.throws(() => hashOf(at('gone.bin'), undefined), /ENOENT/);
  });
});
