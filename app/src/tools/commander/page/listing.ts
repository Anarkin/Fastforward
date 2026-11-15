import { parentFolder, type Entry } from '../shared/protocol';
import type { Sort } from '../shared/settings';
import { noFileColors, type FileColors } from './fileColors';
import { fileGroupOf, mergedRows, sortedRows } from './rowOrder';

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
