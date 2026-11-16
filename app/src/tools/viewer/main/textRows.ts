import { wholeLineBytes, type TextRow } from '../shared/protocol';
import { blockBytes, type ReadBytes } from '../../../lib/main/fileBlocks';
import { utf8, type TextCoding } from '../../../lib/main/textCodings';

export const rowBytes = 4096;

export const readBudgetBytes = 512 * 1024;

export interface ReadBudget {
  readonly least: number;
  readonly bytes: number;
}

function enough(
  rows: readonly TextRow[],
  count: number,
  bytes: number,
  budget: ReadBudget | undefined,
): boolean {
  return (
    rows.length >= count ||
    (budget !== undefined &&
      rows.length >= budget.least &&
      bytes >= budget.bytes)
  );
}

const charLookahead = 4;

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
  if (startsLine && known && lineEnd - offset <= wholeLineBytes) {
    return whole;
  }
  if (startsLine && !known && block.length - offset <= wholeLineBytes) {
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
  budget?: ReadBudget,
): Promise<TextRow[]> {
  const rows: TextRow[] = [];
  let bytes = 0;
  let position = aligned(start, coding);
  let startsLine = await startsLineAt(read, position, coding);
  let length = blockBytes;
  while (!enough(rows, count, bytes, budget) && position < size) {
    const block = await read(position, Math.min(length, size - position));
    const atEnd = position + block.length >= size;
    let offset = 0;
    while (!enough(rows, count, bytes, budget) && offset < block.length) {
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
      bytes += row.end - offset;
      offset = row.end;
    }
    if (offset === 0) {
      if (length > blockBytes) {
        break;
      }
      length = blockBytes + wholeLineBytes;
      continue;
    }
    length = blockBytes;
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

async function lineStartBefore(
  read: ReadBytes,
  at: number,
  coding: TextCoding,
): Promise<number | undefined> {
  for (const back of [rowBytes, wholeLineBytes]) {
    const from = Math.max(0, at - back - coding.unit);
    const line = lastNewlineIn(await read(from, at - from), coding);
    if (line !== -1) {
      return from + line + coding.unit;
    }
    if (from === 0) {
      return 0;
    }
  }
  return undefined;
}

async function lineEndsBy(
  read: ReadBytes,
  at: number,
  end: number,
  coding: TextCoding,
): Promise<boolean> {
  for (const wanted of [Math.min(rowBytes, end - at), end - at]) {
    const ahead = await read(at, wanted);
    if (ahead.length < wanted || nextNewline(ahead, 0, coding) !== -1) {
      return true;
    }
  }
  return false;
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
  const lineStart = await lineStartBefore(read, at, coding);
  if (
    lineStart !== undefined &&
    (await lineEndsBy(
      read,
      at,
      lineStart + wholeLineBytes + coding.unit,
      coding,
    ))
  ) {
    return lineStart;
  }
  return cutBefore(read, at, coding);
}

export async function rowsBefore(
  read: ReadBytes,
  size: number,
  end: number,
  count: number,
  coding: TextCoding = utf8,
  budget?: ReadBudget,
): Promise<TextRow[]> {
  const rows: TextRow[] = [];
  let at = aligned(Math.min(end, size), coding);
  const last = at;
  while (!enough(rows, count, last - at, budget) && at > 0) {
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
