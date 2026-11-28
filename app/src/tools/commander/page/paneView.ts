import type { SearchOptions } from '../../../lib/shared/searchOptions';
import type {
  CommanderToWebviewOf,
  Entry,
  FlatProgress,
} from '../shared/protocol';
import type { Sort } from '../shared/sorts';
import { rowsOf, type Row } from './listing';
import { selectionAfter, type Selection } from './rowSelection';
import type { FileColors } from '../../../lib/page/fileColors';

export interface Listed {
  readonly folder: string;
  readonly hidden: readonly boolean[];
  readonly entries: readonly Entry[];
  readonly parent: boolean;
  readonly back: boolean;
  readonly forward: boolean;
  readonly elevated: boolean;
  readonly binOff?: true;
  readonly archive?: string;
}

export interface FlatShown {
  readonly query: string;
  readonly options: SearchOptions;
  readonly rows: readonly Row[];
}

interface FlatView {
  readonly walk: number;
  readonly progress: FlatProgress;
  readonly shown: FlatShown | undefined;
}

interface DuplicatesView {
  readonly look: number;
  readonly groups: readonly (readonly string[])[];
  readonly reading: boolean;
}

export function duplicatesOf(
  before: DuplicatesView | undefined,
  look: number | undefined,
): DuplicatesView | undefined {
  if (look === undefined) {
    return undefined;
  }
  return before?.look === look ? before : { look, groups: [], reading: true };
}

export interface KeptMarks {
  readonly folder: string;
  readonly selected: string | undefined;
  readonly marked: readonly string[];
}

export interface PaneView extends Listed {
  readonly sort: Sort;
  readonly rows: readonly Row[];
  readonly selected: string | undefined;
  readonly marked: ReadonlySet<string>;
  readonly repositories: ReadonlySet<string>;
  readonly inRepository?: boolean;
  readonly flat?: FlatView;
  readonly duplicates?: DuplicatesView;
  readonly counting: number;
  readonly restored?: true;
}

export const noMarks: ReadonlySet<string> = new Set();

export const noRepositories: ReadonlySet<string> = new Set();

function countingIn(entries: readonly Entry[]): number {
  return entries.reduce(
    (count, entry) => (entry.counting === true ? count + 1 : count),
    0,
  );
}

function repositoriesKept(
  pane: PaneView | undefined,
  folder: string,
): ReadonlySet<string> {
  return pane === undefined || pane.folder !== folder
    ? noRepositories
    : pane.repositories;
}

export function marksKept(
  pane: PaneView | undefined,
  folder: string,
  rows: readonly Row[],
): ReadonlySet<string> {
  if (pane === undefined || pane.folder !== folder || pane.marked.size === 0) {
    return noMarks;
  }
  const present = new Set<string>();
  for (const row of rows) {
    if (pane.marked.has(row.key)) {
      present.add(row.key);
    }
  }
  return new Set([...pane.marked].filter((key) => present.has(key)));
}

export function selectionIn(pane: PaneView | undefined): Selection | undefined {
  return (
    pane && {
      folder: pane.folder,
      key: pane.selected,
      index: pane.rows.findIndex((row) => row.key === pane.selected),
    }
  );
}

export function relisted(
  pane: PaneView | undefined,
  sort: Sort,
  {
    folder,
    hidden,
    entries,
    parent,
    back,
    forward,
    elevated,
    binOff,
    archive,
  }: Listed,
  showHidden: boolean,
  fileColors: FileColors,
  selected: string | undefined,
  sortedBefore?: PaneView,
): PaneView {
  const repositories = repositoriesKept(pane, folder);
  const rows = rowsOf(
    entries,
    parent,
    showHidden,
    sort,
    repositories,
    fileColors,
    sortedBefore,
  );
  return {
    folder,
    hidden,
    entries,
    parent,
    back,
    forward,
    elevated,
    ...(binOff && { binOff }),
    ...(archive !== undefined && { archive }),
    sort,
    rows,
    selected: selectionAfter(selectionIn(pane), folder, rows, selected),
    marked: marksKept(pane, folder, rows),
    repositories,
    inRepository: inRepositoryKept(pane, folder),
    ...(pane?.folder === folder &&
      pane.duplicates !== undefined && { duplicates: pane.duplicates }),
    counting: countingIn(entries),
  };
}

export function inRepositoryKept(
  pane: PaneView | undefined,
  folder: string,
): boolean {
  return pane?.folder === folder && pane.inRepository === true;
}

export function withRepositories(
  pane: PaneView | undefined,
  action: Pick<
    CommanderToWebviewOf<'repositories'>,
    'folder' | 'names' | 'inRepository'
  >,
): PaneView | undefined {
  if (
    pane === undefined ||
    pane.folder !== action.folder ||
    pane.flat !== undefined
  ) {
    return undefined;
  }
  const repositories = new Set(action.names);
  const inRepository = action.inRepository === true;
  if (
    repositories.size === pane.repositories.size &&
    [...repositories].every((name) => pane.repositories.has(name)) &&
    inRepository === (pane.inRepository === true)
  ) {
    return undefined;
  }
  return {
    ...pane,
    repositories,
    inRepository,
    rows: pane.rows.map((row) => {
      const repository =
        row.entry?.folder === true && repositories.has(row.key);
      return row.repository === repository ? row : { ...row, repository };
    }),
  };
}

export function withFolderSizes(
  pane: PaneView | undefined,
  action: Pick<CommanderToWebviewOf<'folderSizes'>, 'folder' | 'entries'>,
  showHidden: boolean,
  fileColors: FileColors,
): PaneView | undefined {
  if (
    pane === undefined ||
    pane.folder !== action.folder ||
    pane.flat !== undefined
  ) {
    return undefined;
  }
  const told = new Map(
    action.entries
      .filter((entry) => entry.folder)
      .map((entry) => [entry.name, entry]),
  );
  let changed = false;
  const entries = pane.entries.map((entry) => {
    const sized = entry.folder ? told.get(entry.name) : undefined;
    if (sized === undefined) {
      return entry;
    }
    changed = true;
    return sized;
  });
  return changed
    ? relisted(
        pane,
        pane.sort,
        { ...pane, entries },
        showHidden,
        fileColors,
        undefined,
        pane,
      )
    : undefined;
}

export function withMarks(
  pane: PaneView | undefined,
  action: { readonly keys: readonly string[]; readonly marked: boolean },
): PaneView | undefined {
  if (pane === undefined) {
    return undefined;
  }
  const asked = new Set(action.keys);
  const markable = new Set<string>();
  for (const row of pane.rows) {
    if (row.entry !== undefined && asked.has(row.key)) {
      markable.add(row.key);
    }
  }
  const marked = new Set(pane.marked);
  for (const key of action.keys) {
    if (!markable.has(key)) {
      continue;
    }
    if (action.marked) {
      marked.add(key);
    } else {
      marked.delete(key);
    }
  }
  return { ...pane, marked };
}
