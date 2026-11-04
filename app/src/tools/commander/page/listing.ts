import { matchesFilter } from '../../../shared/fileFilter';
import { parentFolder, type Entry } from '../shared/protocol';
import type { Sort, SortColumn } from '../shared/settings';

export interface Row {
  readonly key: string;
  readonly entry: Entry | undefined;
  readonly base: string;
  readonly extension: string;
}

export function nameParts(entry: Entry): {
  readonly base: string;
  readonly extension: string;
} {
  const dot = entry.name.lastIndexOf('.');
  return entry.folder || dot <= 0
    ? { base: entry.name, extension: '' }
    : { base: entry.name.slice(0, dot), extension: entry.name.slice(dot + 1) };
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

function compareBy(column: SortColumn, a: Row, b: Row): number {
  switch (column) {
    case 'name':
      return collator.compare(a.base, b.base);
    case 'extension':
      return collator.compare(a.extension, b.extension);
    case 'size':
      return (a.entry?.size ?? 0) - (b.entry?.size ?? 0);
    case 'date':
      return (a.entry?.modified ?? 0) - (b.entry?.modified ?? 0);
    default:
      return column satisfies never;
  }
}

function sortedRows(rows: readonly Row[], { column, descending }: Sort): Row[] {
  const direction = descending ? -1 : 1;
  const sortsFolders = column !== 'extension' && column !== 'size';
  return rows.toSorted((a, b) => {
    const folders = a.entry?.folder === true;
    const byColumn = folders && !sortsFolders ? 0 : compareBy(column, a, b);
    return (
      direction *
      (byColumn ||
        collator.compare(a.entry?.name ?? '', b.entry?.name ?? '') ||
        (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    );
  });
}

export function rowsOf(
  entries: readonly Entry[],
  hasParent: boolean,
  showHidden: boolean,
  sort: Sort,
): Row[] {
  const shown = entries
    .filter((entry) => showHidden || !entry.hidden)
    .map((entry) => ({ key: entry.name, entry, ...nameParts(entry) }));
  return [
    ...(hasParent
      ? [
          {
            key: parentFolder,
            entry: undefined,
            base: parentFolder,
            extension: '',
          },
        ]
      : []),
    ...sortedRows(
      shown.filter((row) => row.entry.folder),
      sort,
    ),
    ...sortedRows(
      shown.filter((row) => !row.entry.folder),
      sort,
    ),
  ];
}

export function nextSort(sort: Sort, column: SortColumn): Sort {
  return sort.column === column
    ? { column, descending: !sort.descending }
    : { column, descending: false };
}

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
  return rows.at(Math.min(before.index, rows.length - 1))?.key;
}

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

export function deleteKeys(
  rows: readonly Row[],
  selected: string | undefined,
  marked: ReadonlySet<string> | undefined,
): string[] {
  if (marked !== undefined && marked.size > 0) {
    return rows
      .filter((row) => row.entry !== undefined && marked.has(row.key))
      .map((row) => row.key);
  }
  const row = rows.find((each) => each.key === selected);
  return row?.entry === undefined ? [] : [row.key];
}

export function menuKeys(
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

export function filteredRows(
  rows: readonly Row[],
  words: readonly string[],
): readonly Row[] {
  return words.length === 0
    ? rows
    : rows.filter(
        (row) => row.entry === undefined || matchesFilter(words, row.key),
      );
}

export function filteredSelection(
  rows: readonly Row[],
  selected: string | undefined,
): string | undefined {
  return rows.some((row) => row.key === selected && row.entry !== undefined)
    ? selected
    : (rows.find((row) => row.entry !== undefined) ?? rows[0])?.key;
}
