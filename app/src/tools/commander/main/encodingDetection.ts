import type { TextEncoding } from '../shared/protocol';
import { continuation, high } from './textCodings';
import { readingFile } from './fileBlocks';

const binaryCheckBytes = 8000;

const byteOrderMarks: readonly (readonly [TextEncoding, readonly number[]])[] =
  [
    ['utf-8', [0xef, 0xbb, 0xbf]],
    ['utf-16le', [0xff, 0xfe]],
    ['utf-16be', [0xfe, 0xff]],
  ];

export function byteOrderMarkOf(bytes: Buffer): TextEncoding | undefined {
  return byteOrderMarks.find(([, mark]) =>
    mark.every((byte, index) => bytes[index] === byte),
  )?.[0];
}

const mostlyZero = 0.4;
const rarelyZero = 0.02;

function wholeUnits(bytes: Buffer, little: boolean): Buffer {
  const even = bytes.subarray(0, bytes.length - (bytes.length % 2));
  const last = even.length - 2;
  const value =
    last < 0
      ? 0
      : little
        ? (even[last] ?? 0) | ((even[last + 1] ?? 0) << 8)
        : ((even[last] ?? 0) << 8) | (even[last + 1] ?? 0);
  return high(value) ? even.subarray(0, last) : even;
}

export function utf16Order(bytes: Buffer): 'utf-16le' | 'utf-16be' | undefined {
  const sample = bytes.subarray(0, binaryCheckBytes);
  const pairs = Math.floor(sample.length / 2);
  if (pairs < 2) {
    return undefined;
  }
  let evenZeros = 0;
  let oddZeros = 0;
  for (let index = 0; index + 1 < sample.length; index += 2) {
    evenZeros += sample[index] === 0 ? 1 : 0;
    oddZeros += sample[index + 1] === 0 ? 1 : 0;
  }
  const order =
    oddZeros >= pairs * mostlyZero && evenZeros <= pairs * rarelyZero
      ? 'utf-16le'
      : evenZeros >= pairs * mostlyZero && oddZeros <= pairs * rarelyZero
        ? 'utf-16be'
        : undefined;
  if (order === undefined) {
    return undefined;
  }
  try {
    new TextDecoder(order, { fatal: true }).decode(
      wholeUnits(sample, order === 'utf-16le'),
    );
    return order;
  } catch {
    return undefined;
  }
}

export function looksBinary(bytes: Buffer): boolean {
  return bytes.subarray(0, binaryCheckBytes).includes(0);
}

const utf8CheckBytes = 64 * 1024;

export async function firstBytes(file: string): Promise<Buffer> {
  return readingFile(file, (read) => read(0, utf8CheckBytes));
}

const fatalUtf8 = new TextDecoder('utf-8', { fatal: true });

function lengthOfLead(byte: number): number {
  if (byte >= 0xf0) {
    return 4;
  }
  if (byte >= 0xe0) {
    return 3;
  }
  return byte >= 0xc0 ? 2 : 1;
}

export function isUtf8(bytes: Buffer): boolean {
  let end = bytes.length;
  for (let back = 1; back <= Math.min(3, bytes.length); back++) {
    const byte = bytes[bytes.length - back] ?? 0;
    if (!continuation(byte)) {
      if (lengthOfLead(byte) > back) {
        end = bytes.length - back;
      }
      break;
    }
  }
  try {
    fatalUtf8.decode(bytes.subarray(0, end));
    return true;
  } catch {
    return false;
  }
}
