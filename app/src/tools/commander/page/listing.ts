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
  return row !== undefined && (row.entry === undefined || row.entry.folder);
}
