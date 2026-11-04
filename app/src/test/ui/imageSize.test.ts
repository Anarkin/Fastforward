import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { longestSide, targetSide, thumbnailPixels } from '../../ui/imageSize';

const bytes = (...parts: (number[] | string | Uint8Array)[]) =>
  new Uint8Array(
    parts.flatMap((part) =>
      typeof part === 'string'
        ? Array.from({ length: part.length }, (_, index) =>
            part.charCodeAt(index),
          )
        : [...part],
    ),
  );

const be16 = (value: number) => [value >> 8, value & 0xff];
const le16 = (value: number) => [value & 0xff, value >> 8];
const le24 = (value: number) => [
  value & 0xff,
  (value >> 8) & 0xff,
  value >> 16,
];
const le32 = (value: number) => [
  ...le16(value & 0xffff),
  ...le16(value >>> 16),
];
const be32 = (value: number) => [
  ...be16(value >>> 16),
  ...be16(value & 0xffff),
];

const png = (width: number, height: number) =>
  bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    be32(13),
    'IHDR',
    be32(width),
    be32(height),
    [8, 0, 0, 0, 0],
  );

const jpeg = (width: number, height: number, frame = 0xc0) =>
  bytes(
    [0xff, 0xd8],
    [0xff, 0xe0],
    be16(16),
    'JFIF\0',
    [1, 1, 0],
    be16(1),
    be16(1),
    [0, 0],
    [0xff, 0xdb],
    be16(3),
    [0],
    [0xff, frame],
    be16(17),
    [8],
    be16(height),
    be16(width),
    [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1],
  );

const webp = (chunk: string, body: number[]) =>
  bytes(
    'RIFF',
    le32(4 + 8 + body.length),
    'WEBP',
    chunk,
    le32(body.length),
    body,
  );

suite('Image sizes', () => {
  test('reads the longest side of a PNG, a JPEG of any frame type, a GIF and a BMP from its header, so a thumbnail is decoded at its size rather than whole', () => {
    assert.strictEqual(longestSide(png(600, 300)), 600);
    assert.strictEqual(longestSide(png(300, 600)), 600);
    assert.strictEqual(longestSide(jpeg(4032, 3024)), 4032);
    assert.strictEqual(longestSide(jpeg(3024, 4032, 0xc2)), 4032);
    assert.strictEqual(longestSide(bytes('GIF89a', le16(20), le16(10))), 20);
    assert.strictEqual(
      longestSide(
        bytes('BM', new Uint8Array(16), le32(1920), le32(-1080 >>> 0), [1, 0]),
      ),
      1920,
    );
  });

  test('reads the longest side of a WebP, lossy, lossless or extended', () => {
    assert.strictEqual(
      longestSide(webp('VP8X', [0, 0, 0, 0, ...le24(639), ...le24(479)])),
      640,
    );
    const lossless = (width: number, height: number) => {
      const packed = (width - 1) | ((height - 1) << 14);
      return webp('VP8L', [0x2f, ...le32(packed >>> 0)]);
    };
    assert.strictEqual(longestSide(lossless(300, 500)), 500);
    assert.strictEqual(
      longestSide(
        webp('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(800), ...le16(600)]),
      ),
      800,
    );
  });

  test('reads no size from what it does not know, so the image is decoded whole', () => {
    assert.strictEqual(longestSide(bytes('not an image at all')), undefined);
    assert.strictEqual(longestSide(png(600, 300).subarray(0, 20)), undefined);
    assert.strictEqual(longestSide(bytes([0xff, 0xd8, 0xff, 0xda])), undefined);
    assert.strictEqual(
      longestSide(bytes(new Uint8Array(4), 'ftypavif')),
      undefined,
    );
  });

  test('makes a thumbnail as long as the box in pixels of the screen, or as the image when it is smaller, so a small one is shown at its own size', () => {
    assert.strictEqual(targetSide(4032, 144, 1.25), 180);
    assert.strictEqual(targetSide(600, 144, 1), 144);
    assert.strictEqual(targetSide(20, 144, 1.25), 25);
    assert.strictEqual(targetSide(1, 144, 0.5), 1);
  });

  test('fits what was decoded to that length, keeping its shape, whether it came out landscape at the length already, portrait and longer, or whole', () => {
    assert.deepStrictEqual(thumbnailPixels({ width: 180, height: 135 }, 180), {
      width: 180,
      height: 135,
    });
    assert.deepStrictEqual(thumbnailPixels({ width: 180, height: 240 }, 180), {
      width: 135,
      height: 180,
    });
    assert.deepStrictEqual(thumbnailPixels({ width: 600, height: 300 }, 180), {
      width: 180,
      height: 90,
    });
    assert.deepStrictEqual(thumbnailPixels({ width: 20, height: 10 }, 25), {
      width: 25,
      height: 13,
    });
    assert.deepStrictEqual(thumbnailPixels({ width: 4000, height: 1 }, 180), {
      width: 180,
      height: 1,
    });
  });
});
