import { matchesFilter } from '../../../lib/page/fileFilter';
import { parentFolder, type Entry } from '../shared/protocol';
import type { Sort, SortColumn } from '../shared/settings';
import { groupOfEntry, noFileColors, type FileColors } from './fileColors';

export interface Row {
  readonly key: string;
  readonly entry: Entry | undefined;
  readonly base: string;
  readonly extension: string;
  readonly repository: boolean;
  readonly under?: string;
}

const noRepositories: ReadonlySet<string> = new Set();

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

export function flatRowOf(
  entry: Entry,
  under: string,
): Row & { readonly entry: Entry } {
  return {
    key: `${under}${entry.name}`,
    entry,
    ...nameParts(entry),
    repository: false,
    under,
  };
}

export const parentRow: Row = {
  key: parentFolder,
  entry: undefined,
  base: parentFolder,
  extension: '',
  repository: false,
};

function rowOf(
  entry: Entry,
  repositories: ReadonlySet<string>,
): Row & { readonly entry: Entry } {
  return {
    key: entry.name,
    entry,
    ...nameParts(entry),
    repository: entry.folder && repositories.has(entry.name),
  };
}

function ordersAlike(one: Entry, other: Entry): boolean {
  return (
    one.folder === other.folder &&
    one.size === other.size &&
    one.modified === other.modified &&
    one.executable === other.executable
  );
}

function sameEntry(one: Entry, other: Entry): boolean {
  return (
    ordersAlike(one, other) &&
    one.link === other.link &&
    one.hidden === other.hidden &&
    one.online === other.online &&
    one.counting === other.counting &&
    one.unreadFolders === other.unreadFolders
  );
}

function sameEntries(one: readonly Entry[], other: readonly Entry[]): boolean {
  return (
    one.length === other.length &&
    one.every(
      (entry, index) =>
        entry.name === other[index].name && sameEntry(entry, other[index]),
    )
  );
}

function rowsAgain(
  before: readonly Row[],
  shown: readonly Entry[],
  hasParent: boolean,
  repositories: ReadonlySet<string>,
): {
  readonly kept: readonly Row[];
  readonly added: readonly Row[];
  readonly same: boolean;
} {
  const unseen = new Map(shown.map((entry) => [entry.name, entry]));
  const kept: Row[] = [];
  let same = (before[0]?.entry === undefined) === hasParent;
  for (const row of before) {
    if (row.entry === undefined) {
      continue;
    }
    const entry = unseen.get(row.key);
    if (entry === undefined || !ordersAlike(entry, row.entry)) {
      same = false;
      continue;
    }
    unseen.delete(row.key);
    const repository = entry.folder && repositories.has(entry.name);
    if (sameEntry(entry, row.entry) && repository === row.repository) {
      kept.push(row);
    } else {
      kept.push({ ...row, entry, repository });
      same = false;
    }
  }
  const added = [...unseen.values()].map((entry) => rowOf(entry, repositories));
  return { kept, added, same: same && added.length === 0 };
}

export function rowsOf(
  entries: readonly Entry[],
  hasParent: boolean,
  showHidden: boolean,
  sort: Sort,
  repositories: ReadonlySet<string> = noRepositories,
  fileColors: FileColors = noFileColors,
  sortedBefore?: {
    readonly entries: readonly Entry[];
    readonly rows: readonly Row[];
  },
): readonly Row[] {
  const shown = entries.filter((entry) => showHidden || !entry.hidden);
  const fileGroup = fileGroupOf(sort, fileColors);
  const parent = hasParent ? [parentRow] : [];
  const before = sortedBefore?.rows;
  if (before === undefined) {
    const rows = shown.map((entry) => rowOf(entry, repositories));
    return [
      ...parent,
      ...sortedRows(
        rows.filter((row) => row.entry.folder),
        sort,
        () => 0,
      ),
      ...sortedRows(
        rows.filter((row) => !row.entry.folder),
        sort,
        fileGroup,
      ),
    ];
  }
  if (
    sameEntries(sortedBefore?.entries ?? [], entries) &&
    (before[0]?.entry === undefined) === hasParent
  ) {
    return before;
  }
  const { kept, added, same } = rowsAgain(
    before,
    shown,
    hasParent,
    repositories,
  );
  if (same) {
    return before;
  }
  const inFolders = (row: Row) => row.entry?.folder === true;
  return [
    ...parent,
    ...mergedRows(
      kept.filter(inFolders),
      added.filter(inFolders),
      sort,
      () => 0,
    ),
    ...mergedRows(
      kept.filter((row) => !inFolders(row)),
      added.filter((row) => !inFolders(row)),
      sort,
      fileGroup,
    ),
  ];
}

export function nextSort(sort: Sort, column: SortColumn): Sort {
  return sort.column === column
    ? { ...sort, descending: !sort.descending }
    : { ...sort, column, descending: false };
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
  return rows.at(Math.max(0, Math.min(before.index, rows.length - 1)))?.key;
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

const regexSpecial = /[.+^${}()|[\]\\]/g;

export function namesIgnoreCase(platform: string | undefined): boolean {
  return platform === 'win32' || platform === 'darwin';
}

export function patternMatcher(
  pattern: string,
  platform: string | undefined,
): (name: string) => boolean {
  const flags = namesIgnoreCase(platform) ? 'i' : '';
  const patterns = pattern
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map(
      (part) =>
        new RegExp(
          `^${part.replaceAll(regexSpecial, '\\$&').replaceAll('*', '.*').replaceAll('?', '.')}$`,
          flags,
        ),
    );
  return (name) => patterns.some((each) => each.test(name));
}

export function keysMatching(
  rows: readonly Row[],
  pattern: string,
  platform: string | undefined,
): string[] {
  const matches = patternMatcher(pattern, platform);
  return rows.flatMap((row) =>
    row.entry !== undefined && matches(row.entry.name) ? [row.key] : [],
  );
}

export interface DuplicateRows {
  readonly rows: readonly Row[];
  readonly starts: ReadonlySet<string>;
}

export function duplicateRows(
  rows: readonly Row[],
  groups: readonly (readonly string[])[],
): DuplicateRows {
  const groupOf = new Map<string, number>();
  for (const [index, group] of groups.entries()) {
    for (const key of group) {
      groupOf.set(key, index);
    }
  }
  const shown = new Map<number, Row[]>();
  const kept: Row[] = [];
  for (const row of rows) {
    const group = groupOf.get(row.key);
    if (row.entry === undefined) {
      kept.push(row);
    } else if (group !== undefined) {
      const together = shown.get(group);
      if (together === undefined) {
        shown.set(group, [row]);
      } else {
        together.push(row);
      }
    }
  }
  const starts = new Set<string>();
  for (const together of shown.values()) {
    if (together.length > 1) {
      starts.add(together[0].key);
      kept.push(...together);
    }
  }
  return { rows: kept, starts };
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
