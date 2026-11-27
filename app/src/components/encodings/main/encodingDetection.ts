import {
  byteOrderMarkOf,
  markBytesOf,
  startsWithMark,
} from '../shared/byteOrderMarks';
import type { TextEncoding } from '../shared/textEncodings';
import { codingOf, continuation, high } from './textCodings';
import { readingFile } from '../../../lib/main/fileBlocks';

const binaryCheckBytes = 8000;

const lastBackspace = 0x08;
const firstShiftOut = 0x0e;
const lastSubstitute = 0x1a;
const firstFileSeparator = 0x1c;
const lastUnitSeparator = 0x1f;

function holdsControlsNoTextHolds(text: string): boolean {
  for (let at = 0; at < text.length; at++) {
    const code = text.charCodeAt(at);
    if (
      code <= lastBackspace ||
      (code >= firstShiftOut && code <= lastSubstitute) ||
      (code >= firstFileSeparator && code <= lastUnitSeparator)
    ) {
      return true;
    }
  }
  return false;
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
    const text = new TextDecoder(order, { fatal: true }).decode(
      wholeUnits(sample, order === 'utf-16le'),
    );
    return holdsControlsNoTextHolds(text) ? undefined : order;
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
  whole = true,
): TextEncoding | undefined {
  const marked = byteOrderMarkOf(bytes) ?? utf16Order(bytes);
  if (marked !== undefined) {
    return marked;
  }
  if (looksBinary(bytes)) {
    return undefined;
  }
  return isUtf8(bytes, whole) ? 'utf-8' : codePage;
}

export interface DecodedText {
  readonly text: string;
  readonly encoding: TextEncoding;
  readonly bom: boolean;
}

export function decodedText(
  bytes: Buffer,
  codePage: TextEncoding,
  whole = true,
): DecodedText | undefined {
  const encoding = encodingOf(bytes, codePage, whole);
  if (encoding === undefined) {
    return undefined;
  }
  const bom = startsWithMark(bytes, encoding);
  return {
    text: codingOf(encoding).decode(
      bytes.subarray(bom ? (markBytesOf(encoding)?.length ?? 0) : 0),
    ),
    encoding,
    bom,
  };
}
