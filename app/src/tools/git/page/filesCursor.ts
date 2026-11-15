import { listedFilesRows, treeRowOf, type FilesRow } from './filesRows';
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
