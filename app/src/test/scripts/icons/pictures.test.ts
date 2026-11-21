import * as assert from 'node:assert';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { suite, test } from 'vitest';

const appFolder = path.join(__dirname, '..', '..', '..', '..');

type Rgb = readonly [number, number, number];
type Picture = (x: number, y: number) => Rgb | undefined;

interface Pictures {
  readonly discPicture: (size: number) => Picture;
  readonly platePicture: (size: number) => Picture;
}

interface Raster {
  readonly rasterized: (picture: Picture, size: number) => Uint8Array;
}

async function load<T>(name: string): Promise<T> {
  const loaded: T = await import(
    pathToFileURL(path.join(appFolder, 'scripts', 'icons', `${name}.mts`)).href
  );
  return loaded;
}

function pixelsOf(rgba: Uint8Array, size: number) {
  return Array.from({ length: size * size }, (_, index) => ({
    x: index % size,
    y: Math.floor(index / size),
    rgba: [...rgba.subarray(index * 4, index * 4 + 4)],
  }));
}

suite('Icon pictures', () => {
  test('colors the pixels along the rim of the disc below the folder only with the yellow of its front, as the sky drawn under the whole disc showed through them as a dark ring', async () => {
    const { discPicture } = await load<Pictures>('pictures');
    const { rasterized } = await load<Raster>('raster');
    const size = 48;
    const rim = pixelsOf(rasterized(discPicture(size), size), size).filter(
      ({ y, rgba: [, , , alpha = 0] }) =>
        y >= size * 0.6 && alpha > 0 && alpha < 255,
    );
    assert.ok(rim.length > 0);
    assert.deepStrictEqual(
      rim.filter(({ rgba }) => rgba.slice(0, 3).join() !== '251,188,4'),
      [],
    );
  });

  test('draws the disc of the macOS icon on a white plate with a margin around it, its corners left clear', async () => {
    const { platePicture } = await load<Pictures>('pictures');
    const picture = platePicture(1024);
    assert.deepStrictEqual(
      [
        picture(50, 512),
        picture(110, 110),
        picture(150, 512),
        picture(512, 900),
      ],
      [undefined, undefined, [255, 255, 255], [255, 255, 255]],
    );
    assert.notDeepStrictEqual(picture(512, 512), [255, 255, 255]);
  });
});
