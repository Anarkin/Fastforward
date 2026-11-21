import * as assert from 'node:assert';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { suite, test } from 'vitest';

const appFolder = path.join(__dirname, '..', '..', '..', '..');

type Rgb = readonly [number, number, number];

interface Raster {
  readonly rasterized: (
    picture: (x: number, y: number) => Rgb | undefined,
    size: number,
  ) => Uint8Array;
}

async function loadRaster(): Promise<Raster> {
  const loaded: Raster = await import(
    pathToFileURL(path.join(appFolder, 'scripts', 'icons', 'raster.mts')).href
  );
  return loaded;
}

suite('Raster', () => {
  test('gives a pixel a shape half covers the color of the shape alone, at half its opacity, so nothing drawn under the shape shows through its edge', async () => {
    const { rasterized } = await loadRaster();
    const rgba = rasterized(
      (x) => (x < 0.5 ? [250, 180, 4] : x < 1 ? undefined : [26, 115, 232]),
      2,
    );
    assert.deepStrictEqual([...rgba.subarray(0, 4)], [250, 180, 4, 128]);
    assert.deepStrictEqual([...rgba.subarray(4, 8)], [26, 115, 232, 255]);
  });
});
