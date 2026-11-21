import { crc32, deflateSync, inflateSync } from 'node:zlib';

export interface Pixels {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

const signature = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const bitDepth = 8;
const rgbaColorType = 6;
const noFilter = 0;

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typed = new Uint8Array(4 + data.length);
  typed.set(new TextEncoder().encode(type));
  typed.set(data, 4);
  const bytes = new Uint8Array(12 + data.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  bytes.set(typed, 4);
  view.setUint32(8 + data.length, crc32(typed));
  return bytes;
}

function concatenated(parts: readonly Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0),
  );
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return bytes;
}

export function encodedPng({ width, height, rgba }: Pixels): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([bitDepth, rgbaColorType, 0, 0, 0], 8);
  const rowLength = width * 4;
  const rows = new Uint8Array(height * (rowLength + 1));
  for (let y = 0; y < height; y++) {
    rows[y * (rowLength + 1)] = noFilter;
    rows.set(
      rgba.subarray(y * rowLength, (y + 1) * rowLength),
      y * (rowLength + 1) + 1,
    );
  }
  return concatenated([
    signature,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', new Uint8Array()),
  ]);
}

export function decodedPng(bytes: Uint8Array): Pixels {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (signature.some((byte, index) => bytes[index] !== byte)) {
    throw new Error('Not a PNG.');
  }
  let width = 0;
  let height = 0;
  const data: Uint8Array[] = [];
  for (let at = signature.length; at < bytes.length;) {
    const length = view.getUint32(at);
    const type = new TextDecoder().decode(bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      if (body[8] !== bitDepth || body[9] !== rgbaColorType || body[12] !== 0) {
        throw new Error('Only 8-bit RGBA PNGs without interlacing are read.');
      }
    } else if (type === 'IDAT') {
      data.push(body);
    }
    at += 12 + length;
  }
  const rows = inflateSync(concatenated(data));
  const rowLength = width * 4;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    if (rows[y * (rowLength + 1)] !== noFilter) {
      throw new Error('Only PNGs whose rows are not filtered are read.');
    }
    rgba.set(
      rows.subarray(y * (rowLength + 1) + 1, (y + 1) * (rowLength + 1)),
      y * rowLength,
    );
  }
  return { width, height, rgba };
}
