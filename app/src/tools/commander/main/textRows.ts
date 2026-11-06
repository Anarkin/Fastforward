import * as fs from 'node:fs';
import type { TextEncoding, TextRow } from '../shared/protocol';

export const rowBytes = 4096;

const blockBytes = 64 * 1024;
const charLookahead = 4;

export type ReadBytes = (position: number, length: number) => Promise<Buffer>;

export interface TextCoding {
  readonly unit: 1 | 2;
  readonly newline: Buffer;
  readonly carriageReturn: Buffer;
  readonly decode: (bytes: Buffer) => string;
  readonly boundaryBefore: (bytes: Buffer, at: number) => number;
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
};

function singleByte(encoding: TextEncoding): TextCoding {
  const decoder = new TextDecoder(encoding);
  return {
    unit: 1,
    newline: utf8.newline,
    carriageReturn: utf8.carriageReturn,
    decode: (bytes) => decoder.decode(bytes),
    boundaryBefore: (_bytes, at) => at,
  };
}

const high = (value: number) => value >= 0xd800 && value <= 0xdbff;

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
  return coding.decode(bytes.subarray(from, to));
}

function lineText(bytes: Buffer, coding: TextCoding): string {
  const end = endsWith(bytes, bytes.length, coding.newline)
    ? bytes.length - coding.unit
    : bytes.length;
  return textOf(bytes, 0, end, coding);
}

function endingAt(
  row: TextRow,
  bytes: Buffer,
  size: number,
  coding: TextCoding,
): TextRow {
  return row.end < size && !endsWith(bytes, bytes.length, coding.newline)
    ? { ...row, cut: true }
    : row;
}

function rowText(
  bytes: Buffer,
  end: number,
  size: number,
  coding: TextCoding,
): string {
  return end >= size || endsWith(bytes, bytes.length, coding.newline)
    ? lineText(bytes, coding)
    : coding.decode(bytes);
}

interface RowEnd {
  readonly end: number;
  readonly textEnd: number | undefined;
}

function gridAfter(position: number): number {
  return (Math.floor(position / rowBytes) + 1) * rowBytes;
}

function textEndOf(bytes: Buffer, lineEnd: number, coding: TextCoding): number {
  return endsWith(bytes, lineEnd, coding.carriageReturn)
    ? lineEnd - coding.unit
    : lineEnd;
}

function cutAfter(
  block: Buffer,
  position: number,
  offset: number,
  coding: TextCoding,
): number | undefined {
  for (
    let grid = gridAfter(position + offset) - position;
    grid < block.length;
    grid += rowBytes
  ) {
    const cut = coding.boundaryBefore(block, grid);
    if (cut > offset) {
      return cut;
    }
  }
  return undefined;
}

function rowEndIn(
  block: Buffer,
  position: number,
  offset: number,
  startsLine: boolean,
  atEnd: boolean,
  coding: TextCoding,
): RowEnd | undefined {
  const line = nextNewline(block, offset, coding);
  const known = line !== -1 || atEnd;
  const lineEnd = line === -1 ? block.length : line;
  const whole = {
    end: line === -1 ? lineEnd : line + coding.unit,
    textEnd: lineEnd,
  };
  if (startsLine && known && lineEnd - offset <= rowBytes) {
    return whole;
  }
  if (startsLine && !known && block.length - offset <= rowBytes) {
    return undefined;
  }
  const cut = cutAfter(block, position, offset, coding);
  if (
    cut !== undefined &&
    (!known || cut < Math.max(offset, textEndOf(block, lineEnd, coding)))
  ) {
    return { end: cut, textEnd: undefined };
  }
  return known ? whole : undefined;
}

async function startsLineAt(
  read: ReadBytes,
  position: number,
  coding: TextCoding,
): Promise<boolean> {
  return (
    position <= 0 ||
    (await read(position - coding.unit, coding.unit)).equals(coding.newline)
  );
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
  let startsLine = await startsLineAt(read, position, coding);
  while (rows.length < count && position < size) {
    const block = await read(position, Math.min(blockBytes, size - position));
    const atEnd = position + block.length >= size;
    let offset = 0;
    while (rows.length < count && offset < block.length) {
      const row = rowEndIn(block, position, offset, startsLine, atEnd, coding);
      if (row === undefined) {
        break;
      }
      rows.push(
        row.textEnd === undefined
          ? {
              start: position + offset,
              end: position + row.end,
              text: coding.decode(block.subarray(offset, row.end)),
              cut: true,
            }
          : {
              start: position + offset,
              end: position + row.end,
              text: textOf(block, offset, row.textEnd, coding),
            },
      );
      startsLine = row.textEnd !== undefined;
      offset = row.end;
    }
    if (offset === 0) {
      break;
    }
    position += offset;
  }
  return rows;
}

function startsText(bytes: Buffer, at: number, coding: TextCoding): boolean {
  const next = bytes.subarray(at, at + coding.unit);
  const after = bytes.subarray(at + coding.unit, at + coding.unit * 2);
  return !(
    next.equals(coding.newline) ||
    (next.equals(coding.carriageReturn) && after.equals(coding.newline))
  );
}

async function cutBefore(
  read: ReadBytes,
  at: number,
  coding: TextCoding,
): Promise<number> {
  const grid = Math.floor(at / rowBytes) * rowBytes;
  const from = Math.max(0, grid - rowBytes * 2);
  const bytes = await read(from, grid + rowBytes + charLookahead - from);
  const line = lastNewlineIn(bytes.subarray(0, at - from), coding);
  const lineStart = line === -1 ? (from === 0 ? 0 : -1) : line + coding.unit;
  for (const candidate of [grid + rowBytes, grid, grid - rowBytes]) {
    const index = candidate - from;
    if (candidate > 0 && index < bytes.length) {
      const cut = coding.boundaryBefore(bytes, index);
      if (
        cut <= at - from &&
        cut > lineStart &&
        startsText(bytes, cut, coding)
      ) {
        return from + cut;
      }
    }
  }
  return from + Math.max(0, lineStart);
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
  const from = Math.max(0, at - rowBytes - coding.unit);
  const line = lastNewlineIn(await read(from, at - from), coding);
  const lineStart =
    line === -1 ? (from === 0 ? 0 : undefined) : from + line + coding.unit;
  if (lineStart !== undefined) {
    const wanted = lineStart + rowBytes + coding.unit - at;
    const ahead = await read(at, wanted);
    if (ahead.length < wanted || nextNewline(ahead, 0, coding) !== -1) {
      return lineStart;
    }
  }
  return cutBefore(read, at, coding);
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
    const start = await rowStartAt(read, at - coding.unit, coding);
    const bytes = await read(start, at - start);
    rows.unshift(
      endingAt(
        { start, end: at, text: rowText(bytes, at, size, coding) },
        bytes,
        size,
        coding,
      ),
    );
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

function blockAt(
  into: Map<number, Promise<Buffer>>,
  read: ReadBytes,
  index: number,
): Promise<Buffer> {
  const known = into.get(index);
  if (known !== undefined) {
    into.delete(index);
    into.set(index, known);
    return known;
  }
  const reading = read(index * blockBytes, blockBytes);
  reading.catch(() => {
    if (into.get(index) === reading) {
      into.delete(index);
    }
  });
  into.set(index, reading);
  const oldest = into.keys().next().value;
  if (into.size > cachedBlocks && oldest !== undefined) {
    into.delete(oldest);
  }
  return reading;
}

export function blockCache(): BlockCache {
  let blocks = new Map<number, Promise<Buffer>>();
  return {
    reader: (read) => {
      const into = blocks;
      return async (position, length) => {
        if (length <= 0) {
          return Buffer.alloc(0);
        }
        const first = Math.floor(position / blockBytes);
        const last = Math.floor((position + length - 1) / blockBytes);
        const parts = await Promise.all(
          Array.from({ length: last - first + 1 }, (_, index) =>
            blockAt(into, read, first + index),
          ),
        );
        const offset = position - first * blockBytes;
        const [only] = parts;
        const joined =
          parts.length === 1 && only !== undefined
            ? only
            : Buffer.concat(parts);
        return joined.subarray(offset, offset + length);
      };
    },
    forget: () => {
      blocks = new Map();
    },
  };
}
