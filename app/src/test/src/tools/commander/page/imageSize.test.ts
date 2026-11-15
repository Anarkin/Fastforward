import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  jpegSize,
  storedSizeOf,
} from '../../../../../tools/commander/page/imageSize';

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
  test('reads the size of a PNG, a JPEG of any frame type, a GIF and a BMP from its header, so a thumbnail is decoded at its size rather than whole', () => {
    assert.deepStrictEqual(storedSizeOf(png(600, 300)), {
      width: 600,
      height: 300,
    });
    assert.deepStrictEqual(storedSizeOf(png(300, 600)), {
      width: 300,
      height: 600,
    });
    assert.deepStrictEqual(storedSizeOf(jpeg(4032, 3024)), {
      width: 4032,
      height: 3024,
    });
    assert.deepStrictEqual(storedSizeOf(jpeg(3024, 4032, 0xc2)), {
      width: 3024,
      height: 4032,
    });
    assert.deepStrictEqual(storedSizeOf(bytes('GIF89a', le16(20), le16(10))), {
      width: 20,
      height: 10,
    });
    assert.deepStrictEqual(
      storedSizeOf(
        bytes('BM', new Uint8Array(16), le32(1920), le32(-1080 >>> 0), [1, 0]),
      ),
      { width: 1920, height: 1080 },
    );
  });

  test('reads the size of a WebP, lossy, lossless or extended', () => {
    assert.deepStrictEqual(
      storedSizeOf(webp('VP8X', [0, 0, 0, 0, ...le24(639), ...le24(479)])),
      { width: 640, height: 480 },
    );
    const lossless = (width: number, height: number) => {
      const packed = (width - 1) | ((height - 1) << 14);
      return webp('VP8L', [0x2f, ...le32(packed >>> 0)]);
    };
    assert.deepStrictEqual(storedSizeOf(lossless(300, 500)), {
      width: 300,
      height: 500,
    });
    assert.deepStrictEqual(
      storedSizeOf(
        webp('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(800), ...le16(600)]),
      ),
      { width: 800, height: 600 },
    );
  });

  test('reads no size from what it does not know, so the image is decoded whole', () => {
    assert.strictEqual(storedSizeOf(bytes('not an image at all')), undefined);
    assert.strictEqual(storedSizeOf(png(600, 300).subarray(0, 20)), undefined);
    assert.strictEqual(storedSizeOf(png(0, 300)), undefined);
    assert.strictEqual(
      storedSizeOf(bytes([0xff, 0xd8, 0xff, 0xda])),
      undefined,
    );
    assert.strictEqual(
      storedSizeOf(bytes(new Uint8Array(4), 'ftypavif')),
      undefined,
    );
  });

  test('reads the size a JPEG is stored at, before any turn its EXIF asks for, and none of what is not a JPEG', () => {
    assert.deepStrictEqual(jpegSize(jpeg(4032, 3024)), {
      width: 4032,
      height: 3024,
    });
    assert.deepStrictEqual(jpegSize(jpeg(3024, 4032, 0xc2)), {
      width: 3024,
      height: 4032,
    });
    assert.strictEqual(jpegSize(png(600, 300)), undefined);
  });
});
