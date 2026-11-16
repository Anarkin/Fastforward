import type { ChangeArea, FileChange } from '../shared/protocol';
import { buildFileTree, type FolderNode } from './fileTree';
import { byName } from './byName';
import { fileRowKey } from '../../../lib/page/treeLayout';

export type ChangesTreeRow =
  | {
      readonly kind: 'folder';
      readonly name: string;
      readonly path: string;
      readonly depth: number;
      readonly open: boolean;
      readonly changed: boolean;
    }
  | {
      readonly kind: 'file';
      readonly name: string;
      readonly path: string;
      readonly change: FileChange | undefined;
      readonly depth: number;
    };

export interface ChangesFolder {
  readonly name: string;
  readonly path: string;
  readonly changed: boolean;
  readonly folders: readonly ChangesFolder[];
  readonly files: readonly {
    readonly name: string;
    readonly path: string;
    readonly change: FileChange | undefined;
  }[];
}

function compact(node: FolderNode): FolderNode {
  let merged = node;
  while (merged.files.length === 0 && merged.folders.size === 1) {
    const [only] = merged.folders.values();
    merged = { ...only, name: `${merged.name}/${only.name}` };
  }
  return merged;
}

export function changesTree(
  files: readonly FileChange[],
  allPaths: readonly string[] = [],
): ChangesFolder {
  const changes = new Map(files.map((file) => [file.path, file]));
  const sorted = (node: FolderNode): ChangesFolder => ({
    name: node.name,
    path: node.path,
    changed: node.changed,
    folders: [...node.folders.values()]
      .map((child) => sorted(compact(child)))
      .toSorted(byName),
    files: node.files
      .map((file) => ({ ...file, change: changes.get(file.path) }))
      .toSorted(byName),
  });
  return sorted(buildFileTree(allPaths, changes));
}

export function changesTreeRows(
  tree: ChangesFolder,
  closed: ReadonlySet<string>,
  opened: ReadonlySet<string> = new Set(),
): ChangesTreeRow[] {
  const rows: ChangesTreeRow[] = [];
  const add = (node: ChangesFolder, depth: number) => {
    for (const child of node.folders) {
      const open = child.changed
        ? !closed.has(child.path)
        : opened.has(child.path);
      rows.push({
        kind: 'folder',
        name: child.name,
        path: child.path,
        depth,
        open,
        changed: child.changed,
      });
      if (open) {
        add(child, depth + 1);
      }
    }
    for (const file of node.files) {
      rows.push({ kind: 'file', ...file, depth });
    }
  };
  add(tree, 0);
  return rows;
}

export function treeFolders(
  sides: readonly { area: ChangeArea | undefined; tree: ChangesFolder }[],
): {
  changed: string[];
  unchanged: string[];
} {
  const folders = { changed: [] as string[], unchanged: [] as string[] };
  const add = (node: ChangesFolder, area: ChangeArea | undefined) => {
    for (const child of node.folders) {
      folders[child.changed ? 'changed' : 'unchanged'].push(
        areaKey(area, child.path),
      );
      add(child, area);
    }
  };
  for (const { area, tree } of sides) {
    add(tree, area);
  }
  return folders;
}

export const folderRowKey = (path: string) => `folder:${path}`;

export function areaKey(area: ChangeArea | undefined, key: string): string {
  return area === undefined ? key : `${area}:${key}`;
}

export function treeRowKey(row: ChangesTreeRow): string {
  return row.kind === 'folder' ? folderRowKey(row.path) : fileRowKey(row.path);
}

const parentRows = new WeakMap<readonly ChangesTreeRow[], readonly number[]>();

function parentsOf(rows: readonly ChangesTreeRow[]): readonly number[] {
  let parents = parentRows.get(rows);
  if (!parents) {
    const folders: number[] = [];
    parents = rows.map((row, index) => {
      folders.length = row.depth;
      const parent = folders.at(-1) ?? -1;
      if (row.kind === 'folder') {
        folders.push(index);
      }
      return parent;
    });
    parentRows.set(rows, parents);
  }
  return parents;
}

export function ancestorRows(
  rows: readonly ChangesTreeRow[],
  index: number,
): number[] {
  const parents = parentsOf(rows);
  const ancestors: number[] = [];
  for (let parent = parents[index] ?? -1; parent !== -1;) {
    ancestors.unshift(parent);
    parent = parents[parent];
  }
  return ancestors;
}
