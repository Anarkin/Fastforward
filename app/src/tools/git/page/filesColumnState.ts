import { comparedOf, comparisonLabel } from '../shared/comparisons';
import { shortHash } from '../shared/hashes';
import { workingTreeHash, type FileChange } from '../shared/protocol';
import { listedFilesRows, treeRowOf, type FilesRow } from './changesRows';
import { strings, type Sentence } from '../../../lib/shared/strings';
import { type ListedRows } from '../../../lib/page/listRows';

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
