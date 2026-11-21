export interface SizedPng {
  readonly size: number;
  readonly png: Uint8Array;
}

const headerLength = 6;
const entryLength = 16;
const iconType = 1;
const bitsPerPixel = 32;

export function icoOf(images: readonly SizedPng[]): Uint8Array {
  const tableLength = headerLength + entryLength * images.length;
  const bytes = new Uint8Array(
    tableLength + images.reduce((sum, { png }) => sum + png.length, 0),
  );
  const view = new DataView(bytes.buffer);
  view.setUint16(2, iconType, true);
  view.setUint16(4, images.length, true);
  let offset = tableLength;
  images.forEach(({ size, png }, index) => {
    const entry = headerLength + entryLength * index;
    bytes[entry] = size % 256;
    bytes[entry + 1] = size % 256;
    view.setUint16(entry + 4, 1, true);
    view.setUint16(entry + 6, bitsPerPixel, true);
    view.setUint32(entry + 8, png.length, true);
    view.setUint32(entry + 12, offset, true);
    bytes.set(png, offset);
    offset += png.length;
  });
  return bytes;
}

export function imagesOfIco(bytes: Uint8Array): SizedPng[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: view.getUint16(4, true) }, (_, index) => {
    const entry = headerLength + entryLength * index;
    const offset = view.getUint32(entry + 12, true);
    return {
      size: bytes[entry] || 256,
      png: bytes.slice(offset, offset + view.getUint32(entry + 8, true)),
    };
  });
}
