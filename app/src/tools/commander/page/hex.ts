import { maxBytesAsked } from '../shared/protocol';

export const hexRowBytes = 16;

const groupBytes = 8;
const firstPrintable = 0x20;
const lastPrintable = 0x7e;
const firstLatin = 0xa1;
const softHyphen = 0xad;

function isLatinGlyph(byte: number): boolean {
  return (
    (byte >= firstPrintable && byte <= lastPrintable) ||
    (byte >= firstLatin && byte !== softHyphen)
  );
}

export function byteText(bytes: readonly number[]): string {
  return bytes
    .map((byte) => (isLatinGlyph(byte) ? String.fromCharCode(byte) : '.'))
    .join('');
}

export interface HexRow {
  readonly offset: string;
  readonly hex: string;
  readonly text: string;
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
    text: bytes
      .map((byte) =>
        byte >= firstPrintable && byte <= lastPrintable
          ? String.fromCharCode(byte)
          : '.',
      )
      .join(''),
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
