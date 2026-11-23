import type { ColoredSegment } from '../../../components/syntax/page/lineColors';
import { maxBytesAsked } from '../shared/protocol';

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
