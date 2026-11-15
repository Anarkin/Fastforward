import type { Row } from './listing';

export interface Selection {
  readonly folder: string;
  readonly key: string | undefined;
  readonly index: number;
}

export function selectionAfter(
  before: Selection | undefined,
  folder: string,
  rows: readonly Row[],
  selected: string | undefined,
): string | undefined {
  const has = (key: string | undefined) =>
    key !== undefined && rows.some((row) => row.key === key);
  if (has(selected)) {
    return selected;
  }
  if (before?.folder !== folder) {
    return rows.at(0)?.key;
  }
  if (has(before.key)) {
    return before.key;
  }
  return rows.at(Math.max(0, Math.min(before.index, rows.length - 1)))?.key;
}

export function nearestShown(
  rows: readonly Row[],
  shown: readonly Row[],
  selected: string | undefined,
): string | undefined {
  if (shown === rows || shown.some((row) => row.key === selected)) {
    return selected;
  }
  const kept = new Set(shown.map((row) => row.key));
  const at = Math.max(
    0,
    rows.findIndex((row) => row.key === selected),
  );
  const nearest =
    rows.slice(at).find((row) => kept.has(row.key)) ??
    rows.slice(0, at).findLast((row) => kept.has(row.key));
  return nearest?.key;
}

export function filteredSelection(
  rows: readonly Row[],
  selected: string | undefined,
): string | undefined {
  return rows.some((row) => row.key === selected && row.entry !== undefined)
    ? selected
    : (rows.find((row) => row.entry !== undefined) ?? rows[0])?.key;
}
