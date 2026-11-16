import type { ChangeArea } from '../shared/protocol';
import { stepMatch, type MatchesFound } from '../../../lib/shared/textMatches';
import { foldersOf } from './fileTree';
import {
  moveInList,
  type ListMove,
  type VisibleRows,
} from '../../../lib/page/listMoves';
import type { ListedRows, TreeItem } from '../../../lib/page/listRows';
import { fileRowKey } from '../../../lib/page/treeLayout';
import {
  ancestorRows,
  areaKey,
  folderRowKey,
  treeRowKey,
  type ChangesTreeRow,
} from './changesRows';

export const changesKey = 'changes';

export interface FilesSection {
  readonly area: ChangeArea | undefined;
  readonly header: boolean;
  readonly rows: readonly ChangesTreeRow[];
}

export type FilesRow =
  | { readonly kind: 'header'; readonly area: ChangeArea | undefined }
  | {
      readonly kind: 'tree';
      readonly area: ChangeArea | undefined;
      readonly rows: readonly ChangesTreeRow[];
      readonly index: number;
    };

export function filesRows(sections: readonly FilesSection[]): FilesRow[] {
  return sections.flatMap(({ area, header, rows }): FilesRow[] => [
    ...(header ? [{ kind: 'header' as const, area }] : []),
    ...rows.map((_, index) => ({ kind: 'tree' as const, area, rows, index })),
  ]);
}

export function treeRowOf(
  row: FilesRow | undefined,
): ChangesTreeRow | undefined {
  return row?.kind === 'tree' ? row.rows[row.index] : undefined;
}

function filesRowKey(row: FilesRow): string {
  const tree = treeRowOf(row);
  return areaKey(row.area, tree ? treeRowKey(tree) : changesKey);
}

const listings = new WeakMap<readonly FilesRow[], ListedRows>();

export function listedFilesRows(rows: readonly FilesRow[]): ListedRows {
  let listed = listings.get(rows);
  if (!listed) {
    const keys = rows.map(filesRowKey);
    const indexes = new Map(keys.map((key, index) => [key, index]));
    listed = {
      count: keys.length,
      keyOf: (index) => keys[index],
      indexOf: (key) => indexes.get(key) ?? -1,
    };
    listings.set(rows, listed);
  }
  return listed;
}

export interface FileSelection {
  readonly area: ChangeArea | undefined;
  readonly path: string | undefined;
}

export function shownFileKey(
  area: ChangeArea | undefined,
  path: string,
  listed: Pick<ListedRows, 'indexOf'>,
): string {
  const keys = [
    fileRowKey(path),
    ...foldersOf(path).toReversed().map(folderRowKey),
  ].map((key) => areaKey(area, key));
  return keys.find((key) => listed.indexOf(key) !== -1) ?? keys[0];
}

export type FilesKeyAction =
  | { readonly kind: 'stay' }
  | { readonly kind: 'cursor'; readonly key: string }
  | {
      readonly kind: 'select';
      readonly key: string;
      readonly area: ChangeArea | undefined;
      readonly file: string | undefined;
    }
  | {
      readonly kind: 'toggle';
      readonly area: ChangeArea | undefined;
      readonly folder: string;
      readonly changed: boolean;
    };

export function filesKey(
  key: ListMove | 'folder',
  rows: readonly FilesRow[],
  cursor: string | undefined,
  selected: FileSelection,
  visible: VisibleRows,
): FilesKeyAction | undefined {
  const listed = listedFilesRows(rows);
  const index = cursor === undefined ? -1 : listed.indexOf(cursor);
  if (key === 'folder') {
    const row = index === -1 ? undefined : rows[index];
    const folder = treeRowOf(row);
    return row && folder?.kind === 'folder'
      ? {
          kind: 'toggle',
          area: row.area,
          folder: folder.path,
          changed: folder.changed,
        }
      : { kind: 'stay' };
  }
  const moved = moveInList(
    key,
    index === -1 ? undefined : index,
    listed.count,
    visible,
  );
  if (moved === undefined) {
    return { kind: 'stay' };
  }
  const target = rows[moved];
  const tree = treeRowOf(target);
  const movedKey = listed.keyOf(moved);
  const file = tree?.path;
  return tree?.kind !== 'folder' &&
    (target.area !== selected.area || file !== selected.path)
    ? { kind: 'select', key: movedKey, area: target.area, file }
    : { kind: 'cursor', key: movedKey };
}

export function filesAncestors(
  rows: readonly FilesRow[],
  index: number,
): number[] {
  const row = rows[index];
  return row?.kind === 'tree'
    ? ancestorRows(row.rows, row.index).map(
        (ancestor) => ancestor + index - row.index,
      )
    : [];
}

export function filesTreeItem(
  rows: readonly FilesRow[],
  index: number,
): TreeItem {
  const row = rows[index];
  const tree = treeRowOf(row);
  if (row?.kind !== 'tree' || !tree) {
    return { level: 1 };
  }
  const level =
    tree.depth + (rows[index - row.index - 1]?.kind === 'header' ? 2 : 1);
  return tree.kind === 'folder' ? { level, expanded: tree.open } : { level };
}

function fileRowsOf(rows: readonly FilesRow[]): FileSelection[] {
  return rows.flatMap((row) => {
    const tree = treeRowOf(row);
    return tree?.kind === 'file' ? [{ area: row.area, path: tree.path }] : [];
  });
}

const sameFile = (one: FileSelection, other: FileSelection) =>
  one.area === other.area && one.path === other.path;

export function keptFileRows(
  rows: readonly FilesRow[],
  selected: FileSelection,
): MatchesFound {
  const files = fileRowsOf(rows);
  return {
    current: files.findIndex((file) => sameFile(file, selected)),
    matches: files.length,
  };
}

export function steppedFileRow(
  rows: readonly FilesRow[],
  selected: FileSelection,
  step: 1 | -1,
): FileSelection | undefined {
  const files = fileRowsOf(rows);
  const at = files.findIndex((file) => sameFile(file, selected));
  return files.at(
    at === -1
      ? step === 1
        ? 0
        : files.length - 1
      : stepMatch(at, files.length, step),
  );
}
