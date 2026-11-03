import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  thumbnailKey,
  ThumbnailStore,
} from '../../../../tools/commander/main/thumbnailStore';
import { removeFolder, tempFolder } from '../../../repositories';

const bytes = (size: number, fill = 1) => new Uint8Array(size).fill(fill);

suite('Thumbnail store', () => {
  let folder: string;

  beforeEach(() => {
    folder = path.join(tempFolder('thumbnails'), 'Thumbnails');
  });

  afterEach(() => removeFolder(path.dirname(folder)));

  test('names a thumbnail by the file, its size and time, and the size and pixels of its box, so a change to any makes another', () => {
    const key = thumbnailKey('C:\\a.png', 10, 1000, 144, 1.5);
    assert.match(key, /^[\da-f]{64}$/);
    assert.strictEqual(thumbnailKey('C:\\a.png', 10, 1000, 144, 1.5), key);
    for (const other of [
      thumbnailKey('C:\\b.png', 10, 1000, 144, 1.5),
      thumbnailKey('C:\\a.png', 11, 1000, 144, 1.5),
      thumbnailKey('C:\\a.png', 10, 1001, 144, 1.5),
      thumbnailKey('C:\\a.png', 10, 1000, 96, 1.5),
      thumbnailKey('C:\\a.png', 10, 1000, 144, 1),
    ]) {
      assert.notStrictEqual(other, key);
    }
  });

  test('keeps a thumbnail in a file of its own in its folder, made when first needed, until asked for again, even by a store started anew', async () => {
    const store = new ThumbnailStore(folder);
    assert.strictEqual(await store.read('a'.repeat(64)), undefined);
    await store.write('a'.repeat(64), bytes(10));
    assert.deepStrictEqual(
      await new ThumbnailStore(folder).read('a'.repeat(64)),
      bytes(10),
    );
    assert.deepStrictEqual(fs.readdirSync(folder), [`${'a'.repeat(64)}.webp`]);
  });

  test('deletes the thumbnails asked for least lately once they take more than its limit, keeping the newest', async () => {
    const store = new ThumbnailStore(folder, 25);
    const old = Date.now() / 1000 - 1000;
    for (const [index, name] of ['a', 'b', 'c'].entries()) {
      await store.write(name.repeat(64), bytes(10));
      fs.utimesSync(
        path.join(folder, `${name.repeat(64)}.webp`),
        old + index,
        old + index,
      );
    }
    assert.deepStrictEqual(fs.readdirSync(folder).length, 2);
    assert.ok(await store.read('c'.repeat(64)));
    await new Promise((resolve) => setTimeout(resolve, 50));
    await store.read('b'.repeat(64));
    await new Promise((resolve) => setTimeout(resolve, 50));
    await store.write('d'.repeat(64), bytes(10));
    assert.deepStrictEqual(fs.readdirSync(folder).toSorted(), [
      `${'b'.repeat(64)}.webp`,
      `${'d'.repeat(64)}.webp`,
    ]);
  });

  test('reads nothing for a name that is no key, so no path can be asked for', async () => {
    const store = new ThumbnailStore(folder);
    await store.write('a'.repeat(64), bytes(10));
    assert.strictEqual(await store.read('../secret'), undefined);
    await store.write('../secret', bytes(10));
    assert.deepStrictEqual(fs.readdirSync(path.dirname(folder)), [
      'Thumbnails',
    ]);
  });
});
