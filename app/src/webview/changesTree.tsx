import type { ChangeArea, FileChange } from '../shared/protocol';
import { buildFileTree, type FolderNode } from './fileTree';
import { byName } from './byName';
import { moveInList, type ListMove, type VisibleRows } from './listMoves';
import { FileRow, fileRowKey, FolderRow } from './tree';
import type { ListedRows } from './virtualRows';

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

export function treeFolders(tree: ChangesFolder): {
  changed: string[];
  unchanged: string[];
} {
  const folders = { changed: [] as string[], unchanged: [] as string[] };
  const add = (node: ChangesFolder) => {
    for (const child of node.folders) {
      folders[child.changed ? 'changed' : 'unchanged'].push(child.path);
      add(child);
    }
  };
  add(tree);
  return folders;
}

export const changesKey = 'changes';

export const folderRowKey = (path: string) => `folder:${path}`;

export function areaKey(area: ChangeArea | undefined, key: string): string {
  return area === undefined ? key : `${area}:${key}`;
}

function treeRowKey(row: ChangesTreeRow): string {
  return row.kind === 'folder' ? folderRowKey(row.path) : fileRowKey(row.path);
}

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

export function changesTreeElement(
  row: ChangesTreeRow,
  {
    area,
    showsAll,
    onToggle,
    selected,
    onSelect,
    cursor,
  }: {
    area?: ChangeArea;
    showsAll: boolean;
    onToggle: (folder: string, changed: boolean) => void;
    selected: string | undefined;
    onSelect: (path: string | undefined) => void;
    cursor: string | undefined;
  },
): React.ReactElement {
  const key = areaKey(area, treeRowKey(row));
  return row.kind === 'folder' ? (
    <FolderRow
      key={key}
      path={row.path}
      title={row.path}
      depth={row.depth}
      open={row.open}
      className={[
        ...(showsAll && row.changed ? [] : ['dimmed']),
        ...(cursor === key ? ['selected'] : []),
      ].join(' ')}
      onToggle={(folder) => onToggle(folder, row.changed)}
    >
      <span className="path">{row.name}</span>
    </FolderRow>
  ) : (
    <FileRow
      key={key}
      path={row.path}
      name={row.name}
      depth={row.depth}
      change={row.change}
      selected={selected}
      marked={cursor === key}
      onSelect={onSelect}
    />
  );
}
