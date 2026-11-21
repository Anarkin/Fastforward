import * as assert from 'node:assert';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { suite, test } from 'vitest';

const appFolder = path.join(__dirname, '..', '..', '..', '..');

interface Pixels {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

interface Png {
  readonly encodedPng: (pixels: Pixels) => Uint8Array;
  readonly decodedPng: (bytes: Uint8Array) => Pixels;
}

async function loadPng(): Promise<Png> {
  const loaded: Png = await import(
    pathToFileURL(path.join(appFolder, 'scripts', 'icons', 'png.mts')).href
  );
  return loaded;
}

suite('PNG', () => {
  test('gives back the pixels it was given, as an 8-bit RGBA PNG any viewer opens', async () => {
    const { encodedPng, decodedPng } = await loadPng();
    const rgba = Uint8Array.from(
      { length: 3 * 2 * 4 },
      (_, index) => (index * 37) % 256,
    );
    const png = encodedPng({ width: 3, height: 2, rgba });
    assert.deepStrictEqual(
      [...png.subarray(0, 8)],
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    );
    assert.deepStrictEqual(decodedPng(png), { width: 3, height: 2, rgba });
  });
});
