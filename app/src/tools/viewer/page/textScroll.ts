import { type Ends, type Thumb } from './scrollThumbs';

interface Span {
  readonly start: number;
  readonly end: number;
  readonly opensText?: true;
}

const opensText = (row: Span): boolean =>
  row.start === 0 || row.opensText === true;

interface Loaded {
  readonly rows: readonly Span[];
  readonly top: number;
}

export function topWithin(top: number, count: number, screen: number): number {
  return Math.max(0, Math.min(top, count - screen));
}

export function scrolled(
  loaded: Loaded,
  by: number,
  screen: number,
  size: number,
): { readonly top: number; readonly refill: boolean } | undefined {
  const first = loaded.rows[0];
  const last = loaded.rows.at(-1);
  if (first === undefined || last === undefined) {
    return undefined;
  }
  const atStart = opensText(first);
  const atEnd = last.end >= size;
  const lastTop = Math.max(0, loaded.rows.length - screen);
  const wanted = loaded.top + by;
  if ((wanted < 0 && !atStart) || (wanted > lastTop && !atEnd)) {
    return undefined;
  }
  const top = Math.max(0, Math.min(wanted, lastTop));
  return {
    top,
    refill: (!atStart && top < screen) || (!atEnd && top > lastTop - screen),
  };
}

function rowAt(rows: readonly Span[], byte: number): number {
  let low = 0;
  let high = rows.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((rows[middle]?.start ?? Infinity) <= byte) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

export function jumpedWithin(
  loaded: Loaded,
  byte: number,
  screen: number,
  size: number,
):
  | { readonly row: number; readonly top: number; readonly refill: boolean }
  | undefined {
  const first = loaded.rows[0];
  const last = loaded.rows.at(-1);
  if (first === undefined || last === undefined) {
    return undefined;
  }
  const atStart = opensText(first);
  const atEnd = last.end >= size;
  const lastTop = Math.max(0, loaded.rows.length - screen);
  if (byte < first.start || (byte >= last.end && !atEnd)) {
    return undefined;
  }
  const row = rowAt(loaded.rows, byte);
  if (row > lastTop && !atEnd) {
    return undefined;
  }
  const top = Math.min(row, lastTop);
  return {
    row,
    top,
    refill: (!atStart && top < screen) || (!atEnd && top > lastTop - screen),
  };
}

export function bytesPerRow(rows: readonly Span[]): number | undefined {
  const first = rows[0];
  const last = rows.at(-1);
  return first === undefined || last === undefined
    ? undefined
    : Math.max(1, (last.end - first.start) / rows.length);
}

export function lastScreenStart(
  size: number,
  screen: number,
  perRow: number,
  known: number | undefined,
): number {
  return known ?? Math.max(0, size - screen * perRow);
}

export function textEnds(loaded: Loaded, screen: number, size: number): Ends {
  const first = loaded.rows[0];
  const last = loaded.rows.at(-1);
  if (first === undefined || last === undefined) {
    return { atStart: true, atEnd: true };
  }
  return {
    atStart: opensText(first) && loaded.top <= 0,
    atEnd: last.end >= size && loaded.top >= loaded.rows.length - screen,
  };
}

export function textThumb(
  loaded: Loaded,
  screen: number,
  size: number,
  perRow: number | undefined,
  lastTop: number | undefined,
): Thumb | undefined {
  const first = loaded.rows[loaded.top];
  const ends = textEnds(loaded, screen, size);
  if (first === undefined || size <= 0 || (ends.atStart && ends.atEnd)) {
    return undefined;
  }
  const bytes = perRow ?? bytesPerRow(loaded.rows) ?? 1;
  const end = lastScreenStart(size, screen, bytes, lastTop);
  return {
    start: end > 0 && !opensText(first) ? Math.min(1, first.start / end) : 0,
    length: Math.min(1, screen / (size / bytes)),
  };
}
