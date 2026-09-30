import { useMemo } from 'react';
import type { FileChange } from '../shared/protocol';
import { byName } from './byName';
import { VirtualRows } from './virtualRows';
import { FileRow, fileRowKey, FolderRow } from './tree';

export interface FolderNode {
  readonly name: string;
  readonly path: string;
  readonly folders: Map<string, FolderNode>;
  readonly files: { name: string; path: string }[];
  changed: boolean;
}

function folder(name: string, path: string): FolderNode {
  return { name, path, folders: new Map(), files: [], changed: false };
}

function pathParts(path: string): string[] {
  const parts = path.replace(/\/$/, '').split('/');
  if (path.endsWith('/')) {
    parts.push(`${parts.pop()}/`);
  }
  return parts;
}

export function buildFileTree(
  paths: readonly string[],
  changes: ReadonlyMap<string, FileChange>,
): FolderNode {
  const root = folder('', '');
  const all = new Set(paths);
  for (const change of changes.values()) {
    all.add(change.path);
  }
  for (const path of all) {
    const parts = pathParts(path);
    const name = parts.pop() ?? path;
    const changed = changes.has(path);
    let node = root;
    for (const part of parts) {
      const childPath = node.path ? `${node.path}/${part}` : part;
      let child = node.folders.get(part);
      if (!child) {
        child = folder(part, childPath);
        node.folders.set(part, child);
      }
      if (changed) {
        child.changed = true;
      }
      node = child;
    }
    node.files.push({ name, path });
  }
  return root;
}

export function foldersOf(path: string): string[] {
  const parts = pathParts(path);
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
}

export type FileTreeRow =
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
      readonly depth: number;
    };

export function fileTreeRows(
  tree: FolderNode,
  expanded: ReadonlySet<string>,
): FileTreeRow[] {
  const rows: FileTreeRow[] = [];
  const add = (node: FolderNode, depth: number) => {
    for (const child of [...node.folders.values()].toSorted(byName)) {
      const open = expanded.has(child.path);
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
      rows.push({ kind: 'file', name: file.name, path: file.path, depth });
    }
  };
  add(tree, 0);
  return rows;
}

export function FileTree({
  paths,
  changes,
  selected,
  expanded,
  onToggle,
  onSelect,
}: {
  paths: readonly string[];
  changes: ReadonlyMap<string, FileChange>;
  selected: string | undefined;
  expanded: ReadonlySet<string>;
  onToggle: (folder: string) => void;
  onSelect: (path: string | undefined) => void;
}) {
  const tree = useMemo(() => buildFileTree(paths, changes), [paths, changes]);
  const rows = useMemo(() => fileTreeRows(tree, expanded), [tree, expanded]);

  return (
    <VirtualRows
      rows={rows.map((row) =>
        row.kind === 'folder' ? (
          <FolderRow
            key={`folder:${row.path}`}
            path={row.path}
            title={row.path}
            depth={row.depth}
            open={row.open}
            className={row.changed ? 'changed' : ''}
            onToggle={onToggle}
          >
            {row.name}
          </FolderRow>
        ) : (
          <FileRow
            key={fileRowKey(row.path)}
            path={row.path}
            name={row.name}
            depth={row.depth}
            change={changes.get(row.path)}
            selected={selected}
            onSelect={onSelect}
          />
        ),
      )}
      selectedKey={selected === undefined ? undefined : fileRowKey(selected)}
    />
  );
}
