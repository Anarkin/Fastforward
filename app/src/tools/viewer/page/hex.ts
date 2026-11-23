import type { ColoredSegment } from '../../../components/syntax/page/lineColors';
import { maxBytesAsked } from '../shared/protocol';
import type { TextLine } from '../../../components/cells/page/lines';
import {
  ordered,
  type SelectionShape,
  type TextSelection,
} from '../../../components/cells/page/cellView';
import { wordAround } from '../../../lib/shared/textMatches';

export const hexRowBytes = 16;

const groupBytes = 8;
const firstPrintable = 0x20;
const lastPrintable = 0x7e;

export function byteText(bytes: readonly number[]): string {
  return bytes
    .map((byte) =>
      byte >= firstPrintable && byte <= lastPrintable
        ? String.fromCharCode(byte)
        : '.',
    )
    .join('');
}

export interface HexRow {
  readonly offset: string;
  readonly hex: string;
  readonly text: string;
}

export const offsetKind = 'offset';

const columnGap = '   ';

export interface HexLine {
  readonly text: string;
  readonly bytesAt: number;
  readonly textAt: number;
  readonly segments: readonly ColoredSegment[];
}

export function hexSegments(text: string, digits: number): ColoredSegment[] {
  return [
    { text: text.slice(0, digits), kind: offsetKind },
    ...(text.length > digits ? [{ text: text.slice(digits) }] : []),
  ];
}

export function hexLine(
  { offset, hex, text: characters }: HexRow,
  read = true,
): HexLine {
  const text = read
    ? `${offset}${columnGap}${hex}${columnGap}${characters}`
    : offset;
  const bytesAt = offset.length + columnGap.length;
  return {
    text,
    bytesAt,
    textAt: bytesAt + hex.length + columnGap.length,
    segments: hexSegments(text, offset.length),
  };
}

export interface LoadedBytes {
  readonly start: number;
  readonly length: number;
}

export function offsetDigits(size: number): number {
  return Math.max(8, size.toString(16).length);
}

export function hexRow(
  offset: number,
  bytes: readonly number[],
  digits: number,
): HexRow {
  const pairs = Array.from(
    { length: hexRowBytes },
    (_, index) =>
      bytes[index]?.toString(16).toUpperCase().padStart(2, '0') ?? '  ',
  );
  return {
    offset: offset.toString(16).toUpperCase().padStart(digits, '0'),
    hex: `${pairs.slice(0, groupBytes).join(' ')}  ${pairs.slice(groupBytes).join(' ')}`,
    text: byteText(bytes),
  };
}

export function bytesToAsk(
  topRow: number,
  screen: number,
  size: number,
  loaded: LoadedBytes | undefined,
  rowBytes = hexRowBytes,
): LoadedBytes | undefined {
  const rowCount = Math.ceil(size / rowBytes);
  const askedRows = Math.max(
    1,
    Math.min(screen * 5, Math.floor(maxBytesAsked / rowBytes)),
  );
  const aboveRows = Math.max(0, Math.floor((askedRows - screen) / 2));
  const marginRows = Math.floor(aboveRows / 2);
  if (loaded !== undefined) {
    const neededFrom = Math.max(0, topRow - marginRows);
    const neededTo = Math.min(
      size,
      (topRow + screen + 1 + marginRows) * rowBytes,
      (neededFrom + askedRows) * rowBytes,
    );
    if (
      loaded.start <= neededFrom * rowBytes &&
      loaded.start + loaded.length >= neededTo
    ) {
      return undefined;
    }
  }
  return {
    start:
      Math.max(0, Math.min(topRow - aboveRows, rowCount - askedRows)) *
      rowBytes,
    length: askedRows * rowBytes,
  };
}

const hexPair = 2;

const hexStep = 3;

const mostSought = 200;

interface HexLayout {
  readonly bytesAt: number;
  readonly textAt: number;
  readonly bytes: number;
}

function layoutOf({ text }: TextLine): HexLayout {
  const bytesAt = text.indexOf(columnGap) + columnGap.length;
  const textAt = bytesAt + hexRowBytes * hexStep + columnGap.length;
  return { bytesAt, textAt, bytes: Math.max(0, text.length - textAt) };
}

const hexAt = ({ bytesAt }: HexLayout, byte: number) =>
  bytesAt + byte * hexStep + (byte >= groupBytes ? 1 : 0);

const inHex = (layout: HexLayout, char: number) =>
  char < layout.textAt - columnGap.length + 1;

const clamped = (value: number, most: number) =>
  Math.max(0, Math.min(most, value));

function boundaryAt(layout: HexLayout, char: number): number {
  if (!inHex(layout, char)) {
    return clamped(char - layout.textAt, layout.bytes);
  }
  if (char <= layout.bytesAt) {
    return 0;
  }
  const grouped = char > hexAt(layout, groupBytes) - 1 ? 1 : 0;
  return clamped(
    Math.round((char - layout.bytesAt - grouped) / hexStep),
    layout.bytes,
  );
}

function byteUnder(layout: HexLayout, char: number): number {
  if (!inHex(layout, char)) {
    return clamped(char - layout.textAt, layout.bytes - 1);
  }
  const grouped = char >= hexAt(layout, groupBytes) ? 1 : 0;
  return clamped(
    Math.floor((char - layout.bytesAt - grouped) / hexStep),
    layout.bytes - 1,
  );
}

function placeOf(layout: HexLayout, byte: number, hex: boolean): number {
  if (!hex) {
    return layout.textAt + byte;
  }
  return byte >= layout.bytes && layout.bytes > 0
    ? hexAt(layout, layout.bytes - 1) + hexPair
    : hexAt(layout, byte);
}

function byteOf(layout: HexLayout, char: number): number {
  return inHex(layout, char)
    ? char >= hexAt(layout, Math.max(0, layout.bytes - 1)) + hexPair
      ? layout.bytes
      : boundaryAt(layout, char)
    : clamped(char - layout.textAt, layout.bytes);
}

interface ByteSpan {
  readonly row: TextLine;
  readonly layout: HexLayout;
  readonly from: number;
  readonly to: number;
}

function spansOf(
  selection: TextSelection,
  rows: readonly TextLine[],
): ByteSpan[] {
  const { first, last } = ordered(selection);
  return rows.flatMap((row) => {
    if (row.start < first.start || row.start > last.start) {
      return [];
    }
    const layout = layoutOf(row);
    const from = row.start === first.start ? byteOf(layout, first.char) : 0;
    const to =
      row.start === last.start ? byteOf(layout, last.char) : layout.bytes;
    return to > from ? [{ row, layout, from, to }] : [];
  });
}

function rowsHeld(
  selection: TextSelection,
  rows: readonly TextLine[],
): boolean {
  const { first, last } = ordered(selection);
  const starts = new Set(rows.map(({ start }) => start));
  for (let start = first.start; start <= last.start; start += hexRowBytes) {
    if (!starts.has(start)) {
      return false;
    }
  }
  return true;
}

const pairsOf = ({ row, layout, from, to }: ByteSpan): string[] =>
  Array.from({ length: to - from }, (_, at) =>
    row.text.slice(
      hexAt(layout, from + at),
      hexAt(layout, from + at) + hexPair,
    ),
  );

const spanned = (
  row: TextLine,
  hex: boolean,
  from: number,
  to: number,
): TextSelection => {
  const layout = layoutOf(row);
  return {
    anchor: { start: row.start, char: placeOf(layout, from, hex) },
    focus: { start: row.start, char: placeOf(layout, to, hex) },
  };
};

const pressedInHex = (
  selection: TextSelection,
  rows: readonly TextLine[],
): boolean =>
  rows[0] !== undefined && inHex(layoutOf(rows[0]), selection.anchor.char);

export const hexShape: SelectionShape = {
  placed: (row, char, like) => {
    const layout = layoutOf(row);
    return placeOf(
      layout,
      boundaryAt(layout, char),
      like === undefined ? inHex(layout, char) : inHex(layout, like.char),
    );
  },
  word: (row, char) => {
    const layout = layoutOf(row);
    if (inHex(layout, char)) {
      const byte = byteUnder(layout, char);
      return spanned(row, true, byte, byte + 1);
    }
    const characters = row.text.slice(layout.textAt);
    const at = byteUnder(layout, char);
    const word = wordAround(characters, at);
    return spanned(row, false, word?.start ?? at, word?.end ?? at + 1);
  },
  line: (row, char) => {
    const layout = layoutOf(row);
    return spanned(row, inHex(layout, char), 0, layout.bytes);
  },
  drawn: (selection, row) =>
    spansOf(selection, [row]).flatMap(({ layout, from, to }) => [
      { from: hexAt(layout, from), to: hexAt(layout, to - 1) + hexPair },
      { from: layout.textAt + from, to: layout.textAt + to },
    ]),
  text: (selection, rows) => {
    const hex = pressedInHex(selection, rows);
    return spansOf(selection, rows)
      .map((span) =>
        hex
          ? pairsOf(span)
              .map((pair) => `${pair} `)
              .join('')
          : span.row.text.slice(
              span.layout.textAt + span.from,
              span.layout.textAt + span.to,
            ),
      )
      .join('');
  },
  clip: (text, selection, rows) =>
    pressedInHex(selection, rows) ? text.trimEnd() : text,
  sought: (selection, rows) => {
    if (!rowsHeld(selection, rows)) {
      return undefined;
    }
    const pairs = spansOf(selection, rows).flatMap(pairsOf);
    return pairs.length === 0 || pairs.length > mostSought
      ? undefined
      : pairs.join('');
  },
};
