import { wholeLineBytes, type TextRow } from '../shared/protocol';
import { blockBytes, type ReadBytes } from '../../../lib/main/fileBlocks';
import {
  utf8,
  type TextCoding,
} from '../../../components/encodings/main/textCodings';
import { strings } from '../../../lib/shared/strings';

const lineFeedSign = strings.symbols.lineFeed;

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

function unitIndex(
  bytes: Buffer,
  unit: Buffer,
  from: number,
  coding: TextCoding,
): number {
  let index = bytes.indexOf(unit, from);
  while (index !== -1 && index % coding.unit !== 0) {
    index = bytes.indexOf(unit, index + 1);
  }
  return index;
}

function lastUnitBefore(
  bytes: Buffer,
  unit: Buffer,
  limit: number,
  coding: TextCoding,
): number {
  if (limit < coding.unit) {
    return -1;
  }
  let index = bytes.lastIndexOf(unit, limit - coding.unit);
  while (index > 0 && index % coding.unit !== 0) {
    index = bytes.lastIndexOf(unit, index - 1);
  }
  return index % coding.unit === 0 ? index : -1;
}

function unitAt(
  bytes: Buffer,
  at: number,
  unit: Buffer,
  coding: TextCoding,
): boolean {
  return bytes.subarray(at, at + coding.unit).equals(unit);
}

interface LineBreak {
  readonly textEnd: number;
  readonly end: number;
}

type Breaks = (from: number) => LineBreak | undefined;

function nextUnits(
  bytes: Buffer,
  unit: Buffer,
  coding: TextCoding,
): (from: number) => number {
  let next = -2;
  return (from) => {
    if (next !== -1 && next < from) {
      next = unitIndex(bytes, unit, from, coding);
    }
    return next;
  };
}

function breaksIn(bytes: Buffer, atEnd: boolean, coding: TextCoding): Breaks {
  const feeds = nextUnits(bytes, coding.newline, coding);
  const returns = nextUnits(bytes, coding.carriageReturn, coding);
  return (from) => {
    const feed = feeds(from);
    const lone = returns(from);
    if (lone !== -1 && (feed === -1 || lone < feed)) {
      const after = lone + coding.unit;
      if (after >= bytes.length) {
        return atEnd ? { textEnd: after, end: after } : undefined;
      }
      if (!unitAt(bytes, after, coding.newline, coding)) {
        return { textEnd: after, end: after };
      }
    }
    return feed === -1 ? undefined : { textEnd: feed, end: feed + coding.unit };
  };
}

function lastLineStart(
  bytes: Buffer,
  limit: number,
  coding: TextCoding,
): number {
  const feed = lastUnitBefore(bytes, coding.newline, limit, coding);
  for (
    let lone = lastUnitBefore(bytes, coding.carriageReturn, limit, coding);
    lone !== -1 && lone > feed;
    lone = lastUnitBefore(bytes, coding.carriageReturn, lone, coding)
  ) {
    const after = lone + coding.unit;
    if (!unitAt(bytes, after, coding.newline, coding)) {
      return after;
    }
  }
  return feed === -1 ? -1 : feed + coding.unit;
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
  if (endsWith(bytes, bytes.length, coding.newline)) {
    return { ...row, ending: lineFeedSign };
  }
  return row.end < size && !endsWith(bytes, bytes.length, coding.carriageReturn)
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
  { atEnd, breaks }: { readonly atEnd: boolean; readonly breaks: Breaks },
  coding: TextCoding,
): RowEnd | undefined {
  const found = breaks(offset);
  const known = found !== undefined || atEnd;
  const whole = found ?? { end: block.length, textEnd: block.length };
  const lineEnd = whole.textEnd;
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
  if (position <= 0) {
    return true;
  }
  const around = await read(position - coding.unit, coding.unit * 2);
  return (
    unitAt(around, 0, coding.newline, coding) ||
    (unitAt(around, 0, coding.carriageReturn, coding) &&
      !unitAt(around, coding.unit, coding.newline, coding))
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
  const first = await textStartOf(read, coding);
  let position = Math.max(first, aligned(start, coding));
  let startsLine =
    position === first || (await startsLineAt(read, position, coding));
  let length = blockBytes;
  while (!enough(rows, count, bytes, budget) && position < size) {
    const block = await read(position, Math.min(length, size - position));
    const atEnd = position + block.length >= size;
    const scanning = { atEnd, breaks: breaksIn(block, atEnd, coding) };
    let offset = 0;
    while (!enough(rows, count, bytes, budget) && offset < block.length) {
      const row = rowEndIn(
        block,
        position,
        offset,
        startsLine,
        scanning,
        coding,
      );
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
              ...(row.end > row.textEnd && { ending: lineFeedSign }),
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
  return !(
    unitAt(bytes, at, coding.newline, coding) ||
    unitAt(bytes, at, coding.carriageReturn, coding)
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
  const start = lastLineStart(bytes, at - from, coding);
  const lineStart = start === -1 ? (from === 0 ? 0 : -1) : start;
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
    const start = lastLineStart(
      await read(from, at - from + coding.unit),
      at - from,
      coding,
    );
    if (start !== -1) {
      return from + start;
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
    if (
      ahead.length < wanted ||
      unitIndex(ahead, coding.newline, 0, coding) !== -1 ||
      unitIndex(ahead, coding.carriageReturn, 0, coding) !== -1
    ) {
      return true;
    }
  }
  return false;
}

const utf8Mark = Buffer.from([0xef, 0xbb, 0xbf]);

async function textStartOf(
  read: ReadBytes,
  coding: TextCoding,
): Promise<number> {
  return coding === utf8 && (await read(0, utf8Mark.length)).equals(utf8Mark)
    ? utf8Mark.length
    : 0;
}

export async function rowStartAt(
  read: ReadBytes,
  offset: number,
  coding: TextCoding = utf8,
): Promise<number> {
  return rowStartFrom(read, offset, coding, await textStartOf(read, coding));
}

async function rowStartFrom(
  read: ReadBytes,
  offset: number,
  coding: TextCoding,
  first: number,
): Promise<number> {
  const at = aligned(offset, coding);
  if (at <= first) {
    return first;
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
    return Math.max(first, lineStart);
  }
  return Math.max(first, await cutBefore(read, at, coding));
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
  const first = await textStartOf(read, coding);
  let at = aligned(Math.min(end, size), coding);
  const last = at;
  while (!enough(rows, count, last - at, budget) && at > first) {
    const start = await rowStartFrom(read, at - coding.unit, coding, first);
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
