import { groupBytes, hexPair, hexStep } from './hex';
import type { ByteRange, TextRow } from '../shared/protocol';
import type { TextEncoding } from '../../../components/encodings/shared/textEncodings';
import { matchesIn } from '../../../lib/shared/textMatches';
import type { SearchOptions } from '../../../lib/shared/searchOptions';
import type { FindMark } from '../../../components/cells/page/marks';
import { bytesOf } from './encodedBytes';

function firstEndingAfter(matches: readonly ByteRange[], byte: number): number {
  let low = 0;
  let high = matches.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((matches[middle]?.end ?? 0) <= byte) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function firstStartingFrom(
  matches: readonly ByteRange[],
  byte: number,
): number {
  let low = 0;
  let high = matches.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((matches[middle]?.start ?? 0) < byte) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function charAtByte(
  text: string,
  byte: number,
  encoding: TextEncoding,
): number {
  let at = 0;
  let bytes = 0;
  while (at < text.length && bytes < byte) {
    const next = at + ((text.codePointAt(at) ?? 0) > 0xffff ? 2 : 1);
    bytes += bytesOf(text, at, next, encoding);
    at = next;
  }
  return at;
}

export function textMarks(
  row: Pick<TextRow, 'start' | 'end' | 'text'>,
  query: string,
  options: SearchOptions,
  matches: readonly ByteRange[],
  current: ByteRange | undefined,
  encoding: TextEncoding,
): FindMark[] {
  const isCurrent = (match: ByteRange) => match.start === current?.start;
  const first = matches[firstEndingAfter(matches, row.start)];
  const carried =
    first !== undefined && first.start < row.start ? first : undefined;
  const skip =
    carried === undefined
      ? 0
      : charAtByte(row.text, carried.end - row.start, encoding);
  const ranges = matchesIn(row.text.slice(skip), query, options);
  const currentIndex =
    current !== undefined &&
    current.start >= row.start &&
    current.start < row.end
      ? firstStartingFrom(matches, current.start) -
        firstStartingFrom(matches, row.start)
      : -1;
  const last = matches[firstStartingFrom(matches, row.end) - 1];
  const leaving =
    last !== undefined && last.start >= row.start && last.end > row.end
      ? last
      : undefined;
  return [
    ...(carried === undefined
      ? []
      : [{ start: 0, end: skip, current: isCurrent(carried) }]),
    ...ranges.map((range, index) => ({
      start: range.start + skip,
      end: range.end + skip,
      current: index === currentIndex,
    })),
    ...(leaving === undefined
      ? []
      : [
          {
            start: charAtByte(row.text, leaving.start - row.start, encoding),
            end: row.text.length,
            current: isCurrent(leaving),
          },
        ]),
  ];
}

export function byteMarks(
  offset: number,
  length: number,
  matches: readonly ByteRange[],
  current: ByteRange | undefined,
): FindMark[] {
  const marks: FindMark[] = [];
  const end = offset + length;
  for (
    let index = firstEndingAfter(matches, offset);
    index < matches.length;
    index++
  ) {
    const match = matches[index];
    if (match === undefined || match.start >= end) {
      break;
    }
    marks.push({
      start: Math.max(match.start, offset) - offset,
      end: Math.min(match.end, end) - offset,
      current: match.start === current?.start,
    });
  }
  return marks;
}

const hexColumn = (byte: number) =>
  byte * hexStep + (byte >= groupBytes ? 1 : 0);

export function hexMarks(marks: readonly FindMark[]): FindMark[] {
  return marks.map((mark) => ({
    ...mark,
    start: hexColumn(mark.start),
    end: hexColumn(mark.end - 1) + hexPair,
  }));
}

const movedBy = (column: number, marks: readonly FindMark[]): FindMark[] =>
  marks.map((mark) => ({
    ...mark,
    start: mark.start + column,
    end: mark.end + column,
  }));

export function hexLineMarks(
  marks: readonly FindMark[],
  bytesAt: number,
  textAt: number,
): FindMark[] {
  return [...movedBy(bytesAt, hexMarks(marks)), ...movedBy(textAt, marks)];
}
