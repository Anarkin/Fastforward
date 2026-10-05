import type { FileChange } from '../shared/protocol';
import { buildFileTree, type FolderNode } from './fileTree';
import { byName } from './byName';
import { listKey, moveInList, type VisibleRows } from './listMoves';
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

function treeRowKey(row: ChangesTreeRow): string {
  return row.kind === 'folder' ? folderRowKey(row.path) : fileRowKey(row.path);
}

const listings = new WeakMap<readonly ChangesTreeRow[], ListedRows>();
const headedListings = new WeakMap<readonly ChangesTreeRow[], ListedRows>();

export function listedTreeRows(
  rows: readonly ChangesTreeRow[],
  header: boolean,
): ListedRows {
  const cache = header ? headedListings : listings;
  let listed = cache.get(rows);
  if (!listed) {
    const keys = [...(header ? [changesKey] : []), ...rows.map(treeRowKey)];
    const indexes = new Map(keys.map((key, index) => [key, index]));
    listed = {
      count: keys.length,
      keyOf: (index) => keys[index],
      indexOf: (key) => indexes.get(key) ?? -1,
    };
    cache.set(rows, listed);
  }
  return listed;
}

export type FilesKeyAction =
  | { readonly kind: 'stay' }
  | { readonly kind: 'cursor'; readonly key: string }
  | {
      readonly kind: 'select';
      readonly key: string;
      readonly file: string | undefined;
    }
  | {
      readonly kind: 'toggle';
      readonly folder: string;
      readonly changed: boolean;
    };

export function filesKey(
  key: string,
  rows: readonly ChangesTreeRow[],
  header: boolean,
  cursor: string | undefined,
  selected: string | undefined,
  visible: VisibleRows,
): FilesKeyAction | undefined {
  const listed = listedTreeRows(rows, header);
  const offset = header ? 1 : 0;
  const index = cursor === undefined ? -1 : listed.indexOf(cursor);
  const row = index < offset ? undefined : rows[index - offset];
  if (key === ' ') {
    return row?.kind === 'folder'
      ? { kind: 'toggle', folder: row.path, changed: row.changed }
      : { kind: 'stay' };
  }
  const moved = moveInList(
    key,
    index === -1 ? undefined : index,
    listed.count,
    visible,
  );
  if (moved === undefined) {
    return listKey(key) ? { kind: 'stay' } : undefined;
  }
  const target = moved < offset ? undefined : rows[moved - offset];
  const movedKey = listed.keyOf(moved);
  return (target === undefined || target.kind === 'file') &&
    target?.path !== selected
    ? { kind: 'select', key: movedKey, file: target?.path }
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

export function changesTreeElement(
  row: ChangesTreeRow,
  {
    showsAll,
    onToggle,
    selected,
    onSelect,
    cursor,
  }: {
    showsAll: boolean;
    onToggle: (folder: string, changed: boolean) => void;
    selected: string | undefined;
    onSelect: (path: string | undefined) => void;
    cursor: string | undefined;
  },
): React.ReactElement {
  return row.kind === 'folder' ? (
    <FolderRow
      key={folderRowKey(row.path)}
      path={row.path}
      title={row.path}
      depth={row.depth}
      open={row.open}
      className={[
        ...(showsAll && row.changed ? [] : ['dimmed']),
        ...(cursor === folderRowKey(row.path) ? ['selected'] : []),
      ].join(' ')}
      onToggle={(folder) => onToggle(folder, row.changed)}
    >
      <span className="path">{row.name}</span>
    </FolderRow>
  ) : (
    <FileRow
      key={fileRowKey(row.path)}
      path={row.path}
      name={row.name}
      depth={row.depth}
      change={row.change}
      selected={selected}
      marked={cursor === fileRowKey(row.path)}
      onSelect={onSelect}
    />
  );
}
