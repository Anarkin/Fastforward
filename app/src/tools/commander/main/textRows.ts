import * as fs from 'node:fs';
import type { TextEncoding, TextRow } from '../shared/protocol';

export const rowBytes = 4096;

const blockBytes = 64 * 1024;
const longLineSearch = 1024 * 1024;
const charLookahead = 4;

export type ReadBytes = (position: number, length: number) => Promise<Buffer>;

export interface TextCoding {
  readonly unit: 1 | 2;
  readonly newline: Buffer;
  readonly carriageReturn: Buffer;
  readonly decode: (bytes: Buffer) => string;
  readonly boundaryBefore: (bytes: Buffer, at: number) => number;
  readonly boundaryAfter: (bytes: Buffer, at: number) => number;
}

const continuation = (byte: number | undefined) =>
  byte !== undefined && (byte & 0xc0) === 0x80;

const utf8: TextCoding = {
  unit: 1,
  newline: Buffer.from([0x0a]),
  carriageReturn: Buffer.from([0x0d]),
  decode: (bytes) => bytes.toString('utf8'),
  boundaryBefore: (bytes, at) => {
    let index = at;
    while (index > 0 && continuation(bytes[index])) {
      index--;
    }
    return index;
  },
  boundaryAfter: (bytes, at) => {
    let index = at;
    while (index < bytes.length && continuation(bytes[index])) {
      index++;
    }
    return index;
  },
};

function singleByte(encoding: TextEncoding): TextCoding {
  const decoder = new TextDecoder(encoding);
  return {
    unit: 1,
    newline: utf8.newline,
    carriageReturn: utf8.carriageReturn,
    decode: (bytes) => decoder.decode(bytes),
    boundaryBefore: (_bytes, at) => at,
    boundaryAfter: (_bytes, at) => at,
  };
}

const high = (value: number) => value >= 0xd800 && value <= 0xdbff;
const low = (value: number) => value >= 0xdc00 && value <= 0xdfff;

function utf16(encoding: 'utf-16le' | 'utf-16be'): TextCoding {
  const little = encoding === 'utf-16le';
  const decoder = new TextDecoder(encoding);
  const unitOf = (code: number) => Buffer.from(little ? [code, 0] : [0, code]);
  const valueAt = (bytes: Buffer, index: number) =>
    little
      ? (bytes[index] ?? 0) | ((bytes[index + 1] ?? 0) << 8)
      : ((bytes[index] ?? 0) << 8) | (bytes[index + 1] ?? 0);
  return {
    unit: 2,
    newline: unitOf(0x0a),
    carriageReturn: unitOf(0x0d),
    decode: (bytes) => decoder.decode(bytes),
    boundaryBefore: (bytes, at) => {
      const index = at - (at % 2);
      return index >= 2 && high(valueAt(bytes, index - 2)) ? index - 2 : index;
    },
    boundaryAfter: (bytes, at) => {
      const index = at + (at % 2);
      return index + 1 < bytes.length && low(valueAt(bytes, index))
        ? index + 2
        : index;
    },
  };
}

const codings = new Map<TextEncoding, TextCoding>();

export function codingOf(encoding: TextEncoding): TextCoding {
  let coding = codings.get(encoding);
  if (coding === undefined) {
    coding =
      encoding === 'utf-8'
        ? utf8
        : encoding === 'utf-16le' || encoding === 'utf-16be'
          ? utf16(encoding)
          : singleByte(encoding);
    codings.set(encoding, coding);
  }
  return coding;
}

function aligned(position: number, { unit }: TextCoding): number {
  return position - (position % unit);
}

function nextNewline(bytes: Buffer, from: number, coding: TextCoding): number {
  let index = bytes.indexOf(coding.newline, from);
  while (index !== -1 && index % coding.unit !== 0) {
    index = bytes.indexOf(coding.newline, index + 1);
  }
  return index;
}

function lastNewlineIn(bytes: Buffer, coding: TextCoding): number {
  let index = bytes.lastIndexOf(coding.newline);
  while (index > 0 && index % coding.unit !== 0) {
    index = bytes.lastIndexOf(coding.newline, index - 1);
  }
  return index % coding.unit === 0 ? index : -1;
}

function endsWith(bytes: Buffer, end: number, tail: Buffer): boolean {
  return (
    end >= tail.length && bytes.subarray(end - tail.length, end).equals(tail)
  );
}

function textOf(
  bytes: Buffer,
  from: number,
  to: number,
  coding: TextCoding,
): string {
  const end =
    to - from >= coding.unit && endsWith(bytes, to, coding.carriageReturn)
      ? to - coding.unit
      : to;
  return coding.decode(bytes.subarray(from, end));
}

function lineText(bytes: Buffer, coding: TextCoding): string {
  const end = endsWith(bytes, bytes.length, coding.newline)
    ? bytes.length - coding.unit
    : bytes.length;
  return textOf(bytes, 0, end, coding);
}

export async function rowsFrom(
  read: ReadBytes,
  size: number,
  start: number,
  count: number,
  coding: TextCoding = utf8,
): Promise<TextRow[]> {
  const rows: TextRow[] = [];
  let position = aligned(start, coding);
  while (rows.length < count && position < size) {
    const block = await read(position, Math.min(blockBytes, size - position));
    let offset = 0;
    while (rows.length < count) {
      const rest = block.length - offset;
      const atEnd = position + block.length >= size;
      const line = nextNewline(block, offset, coding);
      const lineEnd = line === -1 ? block.length : line;
      if (lineEnd - offset <= rowBytes && (line !== -1 || atEnd)) {
        const next = line === -1 ? lineEnd : line + coding.unit;
        rows.push({
          start: position + offset,
          end: position + next,
          text: textOf(block, offset, lineEnd, coding),
        });
        offset = next;
      } else if (rest > rowBytes) {
        const cut = coding.boundaryBefore(block, offset + rowBytes);
        const end = cut > offset ? cut : offset + rowBytes;
        rows.push({
          start: position + offset,
          end: position + end,
          text: coding.decode(block.subarray(offset, end)),
        });
        offset = end;
      } else {
        break;
      }
      if (offset >= block.length) {
        break;
      }
    }
    if (offset === 0) {
      break;
    }
    position += offset;
  }
  return rows;
}

export async function rowStartAt(
  read: ReadBytes,
  offset: number,
  coding: TextCoding = utf8,
): Promise<number> {
  const at = aligned(offset, coding);
  if (at <= 0) {
    return 0;
  }
  const from = Math.max(0, at - rowBytes);
  const line = lastNewlineIn(await read(from, at - from), coding);
  if (line !== -1) {
    return from + line + coding.unit;
  }
  if (from === 0) {
    return 0;
  }
  const around = await read(from, at - from + charLookahead);
  return from + coding.boundaryBefore(around, at - from);
}

async function rowsOfLineBefore(
  read: ReadBytes,
  end: number,
  count: number,
  coding: TextCoding,
): Promise<TextRow[]> {
  const from = aligned(Math.max(0, end - longLineSearch), coding);
  const searched = await read(from, Math.max(0, end - coding.unit - from));
  const line = lastNewlineIn(searched, coding);
  if (line !== -1 || from === 0) {
    const lineStart = line === -1 ? 0 : from + line + coding.unit;
    return (await rowsFrom(read, end, lineStart, Infinity, coding)).slice(
      -count,
    );
  }
  const guess = end - rowBytes;
  const start =
    guess +
    coding.boundaryAfter(await read(guess, rowBytes + charLookahead), 0);
  return [
    { start, end, text: lineText(await read(start, end - start), coding) },
  ];
}

export async function rowsBefore(
  read: ReadBytes,
  size: number,
  end: number,
  count: number,
  coding: TextCoding = utf8,
): Promise<TextRow[]> {
  const rows: TextRow[] = [];
  let at = aligned(Math.min(end, size), coding);
  while (rows.length < count && at > 0) {
    const from = Math.max(0, at - rowBytes - coding.unit);
    const searched = await read(from, Math.max(0, at - coding.unit - from));
    const line = lastNewlineIn(searched, coding);
    if (line === -1 && from > 0) {
      const earlier = await rowsOfLineBefore(
        read,
        at,
        count - rows.length,
        coding,
      );
      rows.unshift(...earlier);
      at = earlier[0]?.start ?? 0;
      continue;
    }
    const start = line === -1 ? 0 : from + line + coding.unit;
    rows.unshift({
      start,
      end: at,
      text: lineText(await read(start, at - start), coding),
    });
    at = start;
  }
  return rows;
}

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

export async function readingFile<T>(
  file: string,
  withRead: (read: ReadBytes) => Promise<T>,
): Promise<T> {
  const handle = await fs.promises.open(file, 'r');
  try {
    return await withRead(async (position, length) => {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, position);
      return buffer.subarray(0, bytesRead);
    });
  } finally {
    await handle.close();
  }
}

const cachedBlocks = 64;

export interface BlockCache {
  readonly reader: (read: ReadBytes) => ReadBytes;
  readonly forget: () => void;
}

export function blockCache(): BlockCache {
  let blocks = new Map<number, Promise<Buffer>>();
  const blockAt = (read: ReadBytes, index: number): Promise<Buffer> => {
    const known = blocks.get(index);
    if (known !== undefined) {
      blocks.delete(index);
      blocks.set(index, known);
      return known;
    }
    const reading = read(index * blockBytes, blockBytes);
    const into = blocks;
    reading.catch(() => {
      if (into.get(index) === reading) {
        into.delete(index);
      }
    });
    blocks.set(index, reading);
    const oldest = blocks.keys().next().value;
    if (blocks.size > cachedBlocks && oldest !== undefined) {
      blocks.delete(oldest);
    }
    return reading;
  };
  return {
    reader: (read) => async (position, length) => {
      if (length <= 0) {
        return Buffer.alloc(0);
      }
      const first = Math.floor(position / blockBytes);
      const last = Math.floor((position + length - 1) / blockBytes);
      const parts = await Promise.all(
        Array.from({ length: last - first + 1 }, (_, index) =>
          blockAt(read, first + index),
        ),
      );
      const offset = position - first * blockBytes;
      return Buffer.concat(parts).subarray(offset, offset + length);
    },
    forget: () => {
      blocks = new Map();
    },
  };
}
