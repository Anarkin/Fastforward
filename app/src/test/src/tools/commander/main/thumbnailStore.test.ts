import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test, vi } from 'vitest';
import {
  thumbnailKey,
  ThumbnailStore,
} from '../../../../../tools/commander/main/thumbnailStore';
import { removeFolder, tempFolder } from '../../../../support/repositories';

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

  test('keeps a thumbnail written twice at once, as both writes shared one temporary file and the second failed', async () => {
    const store = new ThumbnailStore(folder);
    const keys = Array.from({ length: 50 }, (_, index) =>
      index.toString(16).padStart(64, '0'),
    );
    for (const key of keys) {
      await Promise.all([
        store.write(key, bytes(10, 1)),
        store.write(key, bytes(10, 2)),
      ]);
    }
    assert.deepStrictEqual(
      fs.readdirSync(folder).toSorted(),
      keys.map((key) => `${key}.webp`).toSorted(),
    );
  });

  test('deletes the temporary files an earlier run left, counting none of them', async () => {
    fs.mkdirSync(folder, { recursive: true });
    const left = `${'c'.repeat(64)}.webp.1.2.tmp`;
    fs.writeFileSync(path.join(folder, left), bytes(100));
    const store = new ThumbnailStore(folder, () => 50);
    assert.strictEqual(await store.full(), false);
    assert.deepStrictEqual(fs.readdirSync(folder), []);
  });

  test('deletes the thumbnails asked for least lately once they take more than its limit, keeping the newest', async () => {
    const store = new ThumbnailStore(folder, () => 25);
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

  test('measures what it keeps a few files at a time, as a folder of hundreds of thousands of thumbnails asked the disk for all at once and held up every other file read', async () => {
    fs.mkdirSync(folder, { recursive: true });
    for (let index = 0; index < 200; index++) {
      fs.writeFileSync(
        path.join(folder, `${index.toString(16).padStart(64, '0')}.webp`),
        bytes(1),
      );
      fs.writeFileSync(
        path.join(
          folder,
          `${index.toString(16).padStart(64, '0')}.webp.1.${index}.tmp`,
        ),
        bytes(1),
      );
    }
    let asking = 0;
    let most = 0;
    const counted =
      <Arguments extends unknown[], Result>(
        original: (...given: Arguments) => Promise<Result>,
      ) =>
      async (...given: Arguments): Promise<Result> => {
        asking += 1;
        most = Math.max(most, asking);
        try {
          return await original(...given);
        } finally {
          asking -= 1;
        }
      };
    const originalStat = fs.promises.stat.bind(fs.promises);
    const originalRm = fs.promises.rm.bind(fs.promises);
    const stat = vi
      .spyOn(fs.promises, 'stat')
      .mockImplementation(counted(originalStat));
    const rm = vi
      .spyOn(fs.promises, 'rm')
      .mockImplementation(counted(originalRm));
    try {
      const store = new ThumbnailStore(folder, () => 150);
      assert.strictEqual(await store.full(), true);
      await store.write('f'.repeat(64), bytes(1));
    } finally {
      stat.mockRestore();
      rm.mockRestore();
    }

    assert.ok(most > 1 && most <= 16, `${most} at once`);
    assert.strictEqual(fs.readdirSync(folder).length, 135);
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

  test('knows which thumbnails it keeps without reading them, nothing for a name that is no key', async () => {
    const store = new ThumbnailStore(folder);
    await store.write('a'.repeat(64), bytes(10));
    assert.strictEqual(await store.has('a'.repeat(64)), true);
    assert.strictEqual(await store.has('b'.repeat(64)), false);
    assert.strictEqual(await store.has('../secret'), false);
  });

  test('is full once its thumbnails take its limit, read anew each time as the settings may change it, so filling a folder can stop before it deletes what it made', async () => {
    let limit = 100;
    const store = new ThumbnailStore(folder, () => limit);
    assert.strictEqual(await store.full(), false);
    await store.write('a'.repeat(64), bytes(60));
    assert.strictEqual(await store.full(), false);
    limit = 50;
    assert.strictEqual(await store.full(), true);
    assert.strictEqual(await new ThumbnailStore(folder, () => 50).full(), true);
  });
});
