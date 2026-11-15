import { comparedOf, comparisonLabel } from '../shared/comparisons';
import { shortHash } from '../shared/hashes';
import {
  workingTreeHash,
  type ChangeArea,
  type FileChange,
} from '../shared/protocol';
import { listedFilesRows, treeRowOf, type FilesRow } from './filesRows';
import { strings } from '../../../lib/shared/strings';
import type { Sentence } from '../../../lib/shared/sentences';
import { type ListedRows } from '../../../lib/page/listRows';
import { areaKey } from './changesRows';
import { matchesFilter } from '../../../lib/page/fileFilter';

export interface MovedCursor {
  readonly key: string;
  readonly from: string | undefined;
  readonly view: string;
}

export function filesCursor(
  moved: MovedCursor | undefined,
  selectedKey: string | undefined,
  view: string,
  keys: Pick<ListedRows, 'indexOf'>,
  shownKey = selectedKey,
): string | undefined {
  return moved !== undefined &&
    moved.from === selectedKey &&
    moved.view === view &&
    keys.indexOf(moved.key) !== -1
    ? moved.key
    : shownKey;
}

export function filesReveal(
  rows: readonly FilesRow[],
  cursor: string | undefined,
  treeView: string | undefined,
): readonly unknown[] {
  const index =
    cursor === undefined ? -1 : listedFilesRows(rows).indexOf(cursor);
  const row = index === -1 ? undefined : treeRowOf(rows[index]);
  return [treeView, row?.kind === 'folder' ? row.open : undefined];
}

export function filesTitle(selection: string | undefined): string {
  if (selection === undefined) {
    return strings.files.title;
  }
  const compared = comparedOf(selection);
  if (compared) {
    return comparisonLabel(compared);
  }
  return selection === workingTreeHash ? '' : shortHash(selection);
}

export function noChangesText(
  selection: string | undefined,
  error: Sentence | undefined,
): string | undefined {
  if (selection === undefined || error !== undefined) {
    return undefined;
  }
  return comparedOf(selection)
    ? strings.files.noDifferences
    : strings.files.noChanges;
}

export function listsNothing({
  files,
  staged,
  allPaths,
  loading,
}: {
  files: readonly FileChange[];
  staged: readonly FileChange[] | undefined;
  allPaths: readonly string[] | undefined;
  loading: boolean;
}): boolean {
  return (
    !loading &&
    files.length === 0 &&
    staged === undefined &&
    (allPaths ?? []).length === 0
  );
}

interface Side {
  readonly area: ChangeArea | undefined;
  readonly files: readonly FileChange[];
  readonly allPaths: readonly string[] | undefined;
}

export function sidesOf(
  files: readonly FileChange[],
  staged: readonly FileChange[] | undefined,
  allPaths: readonly string[] | undefined,
): Side[] {
  return staged === undefined
    ? [{ area: undefined, files, allPaths }]
    : [
        { area: undefined, files: [], allPaths: undefined },
        { area: 'staged', files: staged, allPaths: undefined },
        { area: 'unstaged', files, allPaths },
      ];
}

export function filteredSide(side: Side, words: readonly string[]): Side {
  return words.length === 0
    ? side
    : {
        area: side.area,
        files: side.files.filter((file) =>
          matchesFilter(words, file.path, file.oldPath),
        ),
        allPaths: side.allPaths?.filter((path) => matchesFilter(words, path)),
      };
}

export function toggled(
  folders: ReadonlySet<string>,
  folder: string,
): Set<string> {
  const next = new Set(folders);
  if (!next.delete(folder)) {
    next.add(folder);
  }
  return next;
}

export function foldersOn(
  folders: ReadonlySet<string>,
  area: ChangeArea | undefined,
): ReadonlySet<string> {
  if (area === undefined) {
    return folders;
  }
  const prefix = areaKey(area, '');
  return new Set(
    [...folders]
      .filter((folder) => folder.startsWith(prefix))
      .map((folder) => folder.slice(prefix.length)),
  );
}

export function headerTitle(area: ChangeArea | undefined): string {
  return area === undefined
    ? strings.files.allChanges
    : area === 'staged'
      ? strings.files.staged
      : strings.files.unstaged;
}
