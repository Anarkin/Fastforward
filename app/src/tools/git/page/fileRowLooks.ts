import type { ChangeArea, FileChange } from '../shared/protocol';
import { wholePath } from '../../../lib/page/pathLooks';
import { areaKey, treeRowKey, type ChangesTreeRow } from './changesRows';
import { changesKey, treeRowOf, type FilesRow } from './filesRows';
import { headerTitle } from './filesTitles';

interface Shared {
  readonly key: string;
  readonly area: ChangeArea | undefined;
  readonly selected: boolean;
}

export type FileRowLook =
  | (Shared & { readonly kind: 'header'; readonly text: string })
  | (Shared & {
      readonly kind: 'folder';
      readonly name: string;
      readonly path: string;
      readonly root: string | undefined;
      readonly depth: number;
      readonly open: boolean;
      readonly changed: boolean;
      readonly dimmed: boolean;
    })
  | (Shared & {
      readonly kind: 'file';
      readonly name: string;
      readonly path: string;
      readonly root: string | undefined;
      readonly depth: number;
      readonly change: FileChange | undefined;
    });

function folderOf(
  row: ChangesTreeRow,
  root: string | undefined,
): string | undefined {
  const folder = row.path.slice(
    0,
    Math.max(0, row.path.length - row.name.length - 1),
  );
  return folder === '' ? root : wholePath(root, folder);
}

export interface RowShown {
  readonly cursor: string | undefined;
  readonly showsAll: boolean;
  readonly root: string | undefined;
}

export function fileRowLook(
  row: FilesRow,
  { cursor, showsAll, root }: RowShown,
): FileRowLook {
  const tree = treeRowOf(row);
  if (tree === undefined) {
    const key = areaKey(row.area, changesKey);
    return {
      kind: 'header',
      key,
      area: row.area,
      selected: cursor === key,
      text: headerTitle(row.area),
    };
  }
  const key = areaKey(row.area, treeRowKey(tree));
  const shared = {
    key,
    area: row.area,
    selected: cursor === key,
    name: tree.name,
    path: tree.path,
    root: folderOf(tree, root),
    depth: tree.depth,
  };
  return tree.kind === 'folder'
    ? {
        ...shared,
        kind: 'folder',
        open: tree.open,
        changed: tree.changed,
        dimmed: showsAll && !tree.changed,
      }
    : { ...shared, kind: 'file', change: tree.change };
}
