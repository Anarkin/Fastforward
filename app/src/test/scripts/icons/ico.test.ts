import * as assert from 'node:assert';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { suite, test } from 'vitest';

const appFolder = path.join(__dirname, '..', '..', '..', '..');

interface SizedPng {
  readonly size: number;
  readonly png: Uint8Array;
}

interface Ico {
  readonly icoOf: (images: readonly SizedPng[]) => Uint8Array;
  readonly imagesOfIco: (bytes: Uint8Array) => SizedPng[];
}

async function loadIco(): Promise<Ico> {
  const loaded: Ico = await import(
    pathToFileURL(path.join(appFolder, 'scripts', 'icons', 'ico.mts')).href
  );
  return loaded;
}

suite('ICO', () => {
  test('lists each image by its width and height, 256 written as 0 as the format asks, and gives the images back as they were given', async () => {
    const { icoOf, imagesOfIco } = await loadIco();
    const images = [
      { size: 16, png: Uint8Array.of(1, 2, 3) },
      { size: 256, png: Uint8Array.of(4, 5) },
    ];
    const ico = icoOf(images);
    const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
    assert.deepStrictEqual(
      [
        view.getUint16(0, true),
        view.getUint16(2, true),
        view.getUint16(4, true),
      ],
      [0, 1, 2],
    );
    assert.deepStrictEqual([ico[6], ico[7], ico[22], ico[23]], [16, 16, 0, 0]);
    assert.deepStrictEqual(imagesOfIco(ico), images);
  });
});
