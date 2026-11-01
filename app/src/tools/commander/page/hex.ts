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
  const shownFrom = topRow * rowBytes;
  const shownTo = Math.min(size, (topRow + screen + 1) * rowBytes);
  const margin = screen * rowBytes;
  if (loaded !== undefined) {
    const loadedEnd = loaded.start + loaded.length;
    const startHeld = loaded.start === 0 || shownFrom - margin >= loaded.start;
    const endHeld = loadedEnd >= size || shownTo + margin <= loadedEnd;
    if (
      shownFrom >= loaded.start &&
      shownTo <= loadedEnd &&
      startHeld &&
      endHeld
    ) {
      return undefined;
    }
  }
  return {
    start: Math.max(0, topRow - screen * 2) * rowBytes,
    length: screen * 5 * rowBytes,
  };
}
