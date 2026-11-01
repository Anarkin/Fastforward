import * as fs from 'node:fs';

export const rowBytes = 4096;

const blockBytes = 64 * 1024;

const newline = 0x0a;
const carriageReturn = 0x0d;

import type { TextRow } from '../shared/protocol';

export type ReadBytes = (position: number, length: number) => Promise<Buffer>;

function charStart(bytes: Buffer, at: number): number {
  let index = at;
  while (index > 0 && (bytes[index] & 0xc0) === 0x80) {
    index--;
  }
  return index;
}

function textOf(bytes: Buffer, from: number, to: number): string {
  const end = to > from && bytes[to - 1] === carriageReturn ? to - 1 : to;
  return bytes.toString('utf8', from, end);
}

export async function rowsFrom(
  read: ReadBytes,
  size: number,
  start: number,
  count: number,
): Promise<TextRow[]> {
  const rows: TextRow[] = [];
  let position = start;
  while (rows.length < count && position < size) {
    const block = await read(position, Math.min(blockBytes, size - position));
    let offset = 0;
    while (rows.length < count) {
      const rest = block.length - offset;
      const atEnd = position + block.length >= size;
      const line = block.indexOf(newline, offset);
      const lineEnd = line === -1 ? block.length : line;
      if (lineEnd - offset <= rowBytes && (line !== -1 || atEnd)) {
        rows.push({
          start: position + offset,
          end: position + (line === -1 ? lineEnd : line + 1),
          text: textOf(block, offset, lineEnd),
        });
        offset = line === -1 ? lineEnd : line + 1;
      } else if (rest > rowBytes) {
        const cut = charStart(block, offset + rowBytes);
        const end = cut > offset ? cut : offset + rowBytes;
        rows.push({
          start: position + offset,
          end: position + end,
          text: block.toString('utf8', offset, end),
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

async function lastNewline(
  read: ReadBytes,
  from: number,
  to: number,
): Promise<number | undefined> {
  if (to <= from) {
    return undefined;
  }
  const bytes = await read(from, to - from);
  const index = bytes.lastIndexOf(newline);
  return index === -1 ? undefined : from + index;
}

export async function rowStartAt(
  read: ReadBytes,
  offset: number,
): Promise<number> {
  if (offset <= 0) {
    return 0;
  }
  const from = Math.max(0, offset - rowBytes);
  const line = await lastNewline(read, from, offset);
  if (line !== undefined) {
    return line + 1;
  }
  if (from === 0) {
    return 0;
  }
  const bytes = await read(offset, 1);
  return bytes.length > 0 && (bytes[0] & 0xc0) === 0x80
    ? from + charStart(await read(from, offset - from + 1), offset - from)
    : offset;
}

const longLineSearch = 1024 * 1024;

function nextCharStart(bytes: Buffer): number {
  let index = 0;
  while (index < bytes.length && (bytes[index] & 0xc0) === 0x80) {
    index++;
  }
  return index;
}

async function rowsOfLineBefore(
  read: ReadBytes,
  end: number,
  count: number,
): Promise<TextRow[]> {
  const from = Math.max(0, end - longLineSearch);
  const line = await lastNewline(read, from, end - 1);
  if (line !== undefined || from === 0) {
    const lineStart = line === undefined ? 0 : line + 1;
    return (await rowsFrom(read, end, lineStart, Infinity)).slice(-count);
  }
  const start =
    end - rowBytes + nextCharStart(await read(end - rowBytes, rowBytes));
  const bytes = await read(start, end - start);
  return [{ start, end, text: textOf(bytes, 0, bytes.length) }];
}

export async function rowsBefore(
  read: ReadBytes,
  size: number,
  end: number,
  count: number,
): Promise<TextRow[]> {
  const rows: TextRow[] = [];
  let at = Math.min(end, size);
  while (rows.length < count && at > 0) {
    const from = Math.max(0, at - rowBytes - 1);
    const line = await lastNewline(read, from, at - 1);
    if (line === undefined && from > 0) {
      const earlier = await rowsOfLineBefore(read, at, count - rows.length);
      rows.unshift(...earlier);
      at = earlier[0]?.start ?? 0;
      continue;
    }
    const start = line === undefined ? 0 : line + 1;
    const bytes = await read(start, at - start);
    const lineEnd = bytes.at(-1) === newline ? bytes.length - 1 : bytes.length;
    rows.unshift({ start, end: at, text: textOf(bytes, 0, lineEnd) });
    at = start;
  }
  return rows;
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
