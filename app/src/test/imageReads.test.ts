import * as assert from 'node:assert';
import type { ImageRead } from '../git/files';
import {
  ImageReads,
  largeImagesReadAtOnce,
  smallImageSize,
  smallImagesReadAtOnce,
} from '../imageReads';
import { maxImageSize, type ImageSource } from '../shared/images';

interface Reading {
  readonly path: string;
  readonly limit: number;
  readonly finish: () => void;
}

function heldReads() {
  let open: Reading[] = [];
  const read =
    (path: string, size: number) =>
    (limit: number): Promise<ImageRead> => {
      const { promise, resolve } = Promise.withResolvers<ImageRead>();
      open.push({
        path,
        limit,
        finish: () =>
          resolve(
            size > limit
              ? { kind: 'tooLarge' }
              : { kind: 'image', bytes: Buffer.from(path) },
          ),
      });
      return promise;
    };
  const shown = () =>
    open.map(({ path, limit }) => `${path} ${limit}`).toSorted();
  const finish = async (paths?: readonly string[]) => {
    const done = open.filter(({ path }) => !paths || paths.includes(path));
    open = open.filter((reading) => !done.includes(reading));
    for (const reading of done) {
      reading.finish();
    }
    await settle();
  };
  const finishAll = async () => {
    while (open.length > 0) {
      await finish();
    }
  };
  return { read, shown, finish, finishAll };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

const onDisk = (path: string, id = '1.0'): ImageSource => ({
  root: '/repo',
  path,
  id,
  disk: true,
});

suite('Image reads', () => {
  test('reads many small images at once but only a few large ones, found large by a first read that stops at a small size, as each image is read whole into memory and a document can link any number', async () => {
    const images = new ImageReads();
    const { read, shown, finish, finishAll } = heldReads();
    const large = Array.from({ length: 4 }, (_, at) => `large${at}.png`);
    const small = Array.from({ length: 10 }, (_, at) => `small${at}.png`);
    const served = [
      ...large.map((path) =>
        images.read(onDisk(path), read(path, smallImageSize + 1)),
      ),
      ...small.map((path) =>
        images.read(onDisk(path), read(path, smallImageSize)),
      ),
    ];
    await settle();
    assert.deepStrictEqual(
      shown(),
      [...large, ...small.slice(0, smallImagesReadAtOnce - large.length)]
        .map((path) => `${path} ${smallImageSize}`)
        .toSorted(),
    );
    await finish(large);
    assert.deepStrictEqual(
      shown(),
      [
        ...small
          .slice(0, smallImagesReadAtOnce)
          .map((path) => `${path} ${smallImageSize}`),
        ...large
          .slice(0, largeImagesReadAtOnce)
          .map((path) => `${path} ${maxImageSize}`),
      ].toSorted(),
    );
    await finishAll();
    assert.deepStrictEqual(
      (await Promise.all(served)).map(({ kind }) => kind),
      Array.from(served, () => 'image'),
    );
  });

  test('reads an image asked for again while it waits its turn once for all, as each refresh of the working tree asks for every image of a Markdown preview again, but anew once that read has started, as the file may have changed since', async () => {
    const images = new ImageReads();
    const { read, shown, finish, finishAll } = heldReads();
    const busy = Array.from({ length: smallImagesReadAtOnce }, (_, at) =>
      images.read(onDisk(`busy${at}.png`), read(`busy${at}.png`, 1)),
    );
    const waiting = ['1.0', '1.1', '1.2'].map((id) =>
      images.read(onDisk('shot.png', id), read('shot.png', 1)),
    );
    const committed = ['a', 'b'].map((blob) =>
      images.read(
        { root: '/repo', path: 'shot.png', id: blob.repeat(40), disk: false },
        read(blob, 1),
      ),
    );
    await finish();
    assert.deepStrictEqual(shown(), [
      `a ${smallImageSize}`,
      `b ${smallImageSize}`,
      `shot.png ${smallImageSize}`,
    ]);
    const again = images.read(onDisk('shot.png', '1.3'), read('shot.png', 1));
    await settle();
    assert.deepStrictEqual(shown(), [
      `a ${smallImageSize}`,
      `b ${smallImageSize}`,
      `shot.png ${smallImageSize}`,
      `shot.png ${smallImageSize}`,
    ]);
    await finishAll();
    const [first, ...rest] = await Promise.all(waiting);
    for (const other of rest) {
      assert.strictEqual(other, first);
    }
    assert.notStrictEqual(await again, first);
    await Promise.all([...busy, ...committed]);
  });
});
