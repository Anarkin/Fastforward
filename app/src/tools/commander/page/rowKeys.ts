import type { Row } from './listing';

export function opens(row: Row | undefined): boolean {
  return row !== undefined;
}

export function goesInto(row: Row | undefined): boolean {
  return row !== undefined && (row.entry === undefined || row.entry.folder);
}

export function passedKeys(
  rows: readonly Row[],
  from: number,
  to: number,
): string[] {
  if (from === to) {
    return rows.slice(from, from + 1).map((row) => row.key);
  }
  return from < to
    ? rows.slice(from, to).map((row) => row.key)
    : rows
        .slice(to + 1, from + 1)
        .map((row) => row.key)
        .toReversed();
}

export function rangeKeys(
  rows: readonly Row[],
  from: number,
  to: number,
): string[] {
  return rows
    .slice(Math.min(from, to), Math.max(from, to) + 1)
    .map((row) => row.key);
}

export function chosenKeys(
  rows: readonly Row[],
  selected: string | undefined,
  marked: ReadonlySet<string> | undefined,
): string[] {
  const markedShown =
    marked === undefined || marked.size === 0
      ? []
      : rows
          .filter((row) => row.entry !== undefined && marked.has(row.key))
          .map((row) => row.key);
  if (markedShown.length > 0) {
    return markedShown;
  }
  const row = rows.find((each) => each.key === selected);
  return row?.entry === undefined ? [] : [row.key];
}

export function pointedKeys(
  rows: readonly Row[],
  key: string,
  marked: ReadonlySet<string> | undefined,
): string[] {
  const clicked = rows.find((row) => row.key === key);
  if (clicked?.entry === undefined) {
    return [];
  }
  return marked?.has(key)
    ? rows
        .filter((row) => row.entry !== undefined && marked.has(row.key))
        .map((row) => row.key)
    : [key];
}
