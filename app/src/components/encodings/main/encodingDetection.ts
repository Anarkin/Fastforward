import type { TextEncoding } from '../shared/textEncodings';
import { codingOf, continuation, high } from './textCodings';
import { readingFile } from '../../../lib/main/fileBlocks';

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

function endOfWholeCharacters(bytes: Buffer): number {
  for (let back = 1; back <= Math.min(3, bytes.length); back++) {
    const byte = bytes[bytes.length - back] ?? 0;
    if (!continuation(byte)) {
      return lengthOfLead(byte) > back ? bytes.length - back : bytes.length;
    }
  }
  return bytes.length;
}

export function isUtf8(bytes: Buffer, whole = false): boolean {
  const end = whole ? bytes.length : endOfWholeCharacters(bytes);
  try {
    fatalUtf8.decode(bytes.subarray(0, end));
    return true;
  } catch {
    return false;
  }
}

export function encodingOf(
  bytes: Buffer,
  codePage: TextEncoding,
): TextEncoding | undefined {
  const marked = byteOrderMarkOf(bytes) ?? utf16Order(bytes);
  if (marked !== undefined) {
    return marked;
  }
  if (looksBinary(bytes)) {
    return undefined;
  }
  return isUtf8(bytes, true) ? 'utf-8' : codePage;
}

export interface DecodedText {
  readonly text: string;
  readonly encoding: TextEncoding;
  readonly bom: boolean;
}

export function decodedText(
  bytes: Buffer,
  codePage: TextEncoding,
): DecodedText | undefined {
  const encoding = encodingOf(bytes, codePage);
  if (encoding === undefined) {
    return undefined;
  }
  const mark = byteOrderMarks.find(([marked]) => marked === encoding)?.[1];
  const bom = mark !== undefined && byteOrderMarkOf(bytes) === encoding;
  return {
    text: codingOf(encoding).decode(bytes.subarray(bom ? mark.length : 0)),
    encoding,
    bom,
  };
}
