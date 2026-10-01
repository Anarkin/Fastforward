import type { FileChange } from '../shared/protocol';
import { buildFileTree, type FolderNode } from './fileTree';
import { byName } from './byName';
import { moveInList, type VisibleRows } from './listMoves';
import { FileRow, fileRowKey, FolderRow } from './tree';

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

function compact(node: FolderNode): FolderNode {
  let merged = node;
  while (merged.files.length === 0 && merged.folders.size === 1) {
    const [only] = merged.folders.values();
    merged = { ...only, name: `${merged.name}/${only.name}` };
  }
  return merged;
}

export function changesTreeRows(
  files: readonly FileChange[],
  closed: ReadonlySet<string>,
  unchanged: readonly string[] = [],
  opened: ReadonlySet<string> = new Set(),
): ChangesTreeRow[] {
  const changes = new Map(files.map((file) => [file.path, file]));
  const rows: ChangesTreeRow[] = [];
  const add = (node: FolderNode, depth: number) => {
    for (const child of [...node.folders.values()]
      .map(compact)
      .toSorted(byName)) {
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
    for (const file of node.files.toSorted(byName)) {
      rows.push({
        kind: 'file',
        name: file.name,
        path: file.path,
        change: changes.get(file.path),
        depth,
      });
    }
  };
  add(buildFileTree(unchanged, changes), 0);
  return rows;
}

export function treeFolders(
  files: readonly FileChange[],
  unchanged: readonly string[] = [],
): { changed: string[]; unchanged: string[] } {
  const folders = { changed: [] as string[], unchanged: [] as string[] };
  const add = (node: FolderNode) => {
    for (const child of [...node.folders.values()].map(compact)) {
      folders[child.changed ? 'changed' : 'unchanged'].push(child.path);
      add(child);
    }
  };
  add(
    buildFileTree(unchanged, new Map(files.map((file) => [file.path, file]))),
  );
  return folders;
}

export const changesKey = 'changes';

const folderRowKey = (path: string) => `folder:${path}`;

export function treeRowKey(row: ChangesTreeRow): string {
  return row.kind === 'folder' ? folderRowKey(row.path) : fileRowKey(row.path);
}

export type FilesKeyAction =
  | { readonly kind: 'stay' }
  | { readonly kind: 'cursor'; readonly key: string; readonly file?: string }
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
  visible: VisibleRows,
): FilesKeyAction | undefined {
  const keys = [...(header ? [changesKey] : []), ...rows.map(treeRowKey)];
  const offset = header ? 1 : 0;
  const index = cursor === undefined ? -1 : keys.indexOf(cursor);
  const row = index < offset ? undefined : rows[index - offset];
  if (key === ' ') {
    return row?.kind === 'folder'
      ? { kind: 'toggle', folder: row.path, changed: row.changed }
      : { kind: 'stay' };
  }
  const moved = moveInList(
    key,
    index === -1 ? undefined : index,
    keys.length,
    visible,
  );
  if (moved === undefined) {
    return listKey(key) ? { kind: 'stay' } : undefined;
  }
  const target = moved < offset ? undefined : rows[moved - offset];
  return {
    kind: 'cursor',
    key: keys[moved],
    ...(target === undefined || target.kind === 'file'
      ? { file: target?.path }
      : {}),
  };
}

const listKeyNames = new Set([
  'ArrowDown',
  'ArrowUp',
  'Home',
  'End',
  'PageDown',
  'PageUp',
]);

function listKey(key: string): boolean {
  return listKeyNames.has(key);
}

export function ancestorRows(
  rows: readonly ChangesTreeRow[],
  index: number,
): number[] {
  const ancestors: number[] = [];
  let depth = rows[index]?.depth ?? 0;
  for (let i = index - 1; i >= 0 && depth > 0; i--) {
    const row = rows[i];
    if (row.kind === 'folder' && row.depth < depth) {
      ancestors.unshift(i);
      depth = row.depth;
    }
  }
  return ancestors;
}

export function changesTreeElements({
  rows,
  showsAll,
  onToggle,
  selected,
  onSelect,
  cursor,
}: {
  rows: readonly ChangesTreeRow[];
  showsAll: boolean;
  onToggle: (folder: string, changed: boolean) => void;
  selected: string | undefined;
  onSelect: (path: string | undefined) => void;
  cursor?: string;
}): React.ReactElement[] {
  return rows.map((row) =>
    row.kind === 'folder' ? (
      <FolderRow
        key={`folder:${row.path}`}
        path={row.path}
        title={row.path}
        depth={row.depth}
        open={row.open}
        className={[
          'counted',
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
        onSelect={onSelect}
      />
    ),
  );
}
