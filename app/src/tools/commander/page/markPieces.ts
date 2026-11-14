import type { ByteRange, TextEncoding, TextRow } from '../shared/protocol';
import type { CodeSegment } from '../../../lib/page/syntax';
import { matchesIn } from '../../../lib/shared/textMatches';
import { wholeClusters } from '../../../lib/page/textWidths';
import { bytesOf } from './screenRows';

const groupBytes = 8;

const hexPair = 2;

const hexStep = 3;

export interface FindMark {
  readonly start: number;
  readonly end: number;
  readonly current: boolean;
}

export interface MarkedPiece extends CodeSegment {
  readonly mark: 'match' | 'current' | undefined;
}

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
  const ranges = matchesIn(row.text.slice(skip), query);
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
    start: hexColumn(mark.start),
    end: hexColumn(mark.end - 1) + hexPair,
    current: mark.current,
  }));
}

export function markPieces(
  pieces: readonly CodeSegment[],
  found: readonly FindMark[],
): MarkedPiece[] {
  const marks = wholeClusters(
    pieces.map((piece) => piece.text).join(''),
    found,
  );
  const cuts = new Set<number>();
  for (const mark of marks) {
    cuts.add(mark.start);
    cuts.add(mark.end);
  }
  const marked: MarkedPiece[] = [];
  let at = 0;
  for (const { text, kind } of pieces) {
    const end = at + text.length;
    const edges = [
      at,
      ...[...cuts]
        .filter((cut) => cut > at && cut < end)
        .toSorted((a, b) => a - b),
      end,
    ];
    for (let index = 0; index + 1 < edges.length; index++) {
      const from = edges[index] ?? at;
      const to = edges[index + 1] ?? end;
      const mark = marks.find((each) => each.start <= from && from < each.end);
      marked.push({
        text: text.slice(from - at, to - at),
        kind,
        mark:
          mark === undefined ? undefined : mark.current ? 'current' : 'match',
      });
    }
    at = end;
  }
  return marked;
}
