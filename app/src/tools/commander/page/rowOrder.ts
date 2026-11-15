import type { Sort, SortColumn } from '../shared/sorts';
import { groupOfEntry, type FileColors } from './fileColors';
import type { Row } from './listing';

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

function rankedExtensions(rows: readonly Row[]): (a: Row, b: Row) => number {
  const extensions = [...new Set(rows.map((row) => row.extension))].toSorted(
    collator.compare,
  );
  const ranks = new Map<string, number>();
  extensions.forEach((extension, index) => {
    const before = extensions[index - 1];
    const rank =
      before !== undefined && collator.compare(before, extension) === 0
        ? (ranks.get(before) ?? index)
        : index;
    ranks.set(extension, rank);
  });
  return (a, b) =>
    (ranks.get(a.extension) ?? 0) - (ranks.get(b.extension) ?? 0);
}

const byExtension = (a: Row, b: Row): number =>
  collator.compare(a.extension, b.extension);

function compareBy(
  column: SortColumn,
  a: Row,
  b: Row,
  extensionOrder: (a: Row, b: Row) => number,
): number {
  switch (column) {
    case 'name':
      return collator.compare(a.base, b.base);
    case 'extension':
      return extensionOrder(a, b);
    case 'size':
      return (a.entry?.size ?? 0) - (b.entry?.size ?? 0);
    case 'date':
      return (a.entry?.modified ?? 0) - (b.entry?.modified ?? 0);
    default:
      return column satisfies never;
  }
}

function comparerOf(
  { column, descending }: Sort,
  groupOf: (row: Row) => number,
  extensionOrder: (a: Row, b: Row) => number,
): (a: Row, b: Row) => number {
  const direction = descending ? -1 : 1;
  const sortsFolders = column !== 'extension';
  const groups = new Map<Row, number>();
  const group = (row: Row) => {
    const known = groups.get(row);
    if (known !== undefined) {
      return known;
    }
    const found = groupOf(row);
    groups.set(row, found);
    return found;
  };
  return (a, b) => {
    const folders = a.entry?.folder === true;
    const byColumn =
      folders && !sortsFolders ? 0 : compareBy(column, a, b, extensionOrder);
    return (
      group(a) - group(b) ||
      direction *
        (byColumn ||
          collator.compare(a.entry?.name ?? '', b.entry?.name ?? '') ||
          collator.compare(a.under ?? '', b.under ?? '') ||
          (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    );
  };
}

export function sortedRows<T extends Row>(
  rows: readonly T[],
  sort: Sort,
  groupOf: (row: Row) => number,
): T[] {
  return rows.toSorted(
    comparerOf(
      sort,
      groupOf,
      sort.column === 'extension' ? rankedExtensions(rows) : byExtension,
    ),
  );
}

export function mergedRows<T extends Row>(
  kept: readonly T[],
  added: readonly T[],
  sort: Sort,
  groupOf: (row: Row) => number,
): readonly T[] {
  if (added.length === 0) {
    return kept;
  }
  if (added.length * Math.log2(kept.length + 2) > kept.length) {
    return sortedRows([...kept, ...added], sort, groupOf);
  }
  const compare = comparerOf(sort, groupOf, byExtension);
  const merged: T[] = [];
  let from = 0;
  for (const row of added.toSorted(compare)) {
    let low = from;
    let high = kept.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (compare(kept[middle], row) < 0) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    for (; from < low; from++) {
      merged.push(kept[from]);
    }
    merged.push(row);
  }
  for (; from < kept.length; from++) {
    merged.push(kept[from]);
  }
  return merged;
}

function colorGroupOf(fileColors: FileColors): (row: Row) => number {
  return (row) =>
    (row.entry === undefined
      ? undefined
      : groupOfEntry(row.entry, fileColors)) ?? fileColors.colors.length;
}

export function fileGroupOf(
  sort: Sort,
  fileColors: FileColors,
): (row: Row) => number {
  return sort.groupByColor ? colorGroupOf(fileColors) : () => 0;
}

export function nextSort(sort: Sort, column: SortColumn): Sort {
  return sort.column === column
    ? { ...sort, descending: !sort.descending }
    : { ...sort, column, descending: false };
}
