import { useMemo } from 'react';
import type { FileChange } from '../shared/protocol';
import { VirtualRows } from './virtualRows';
import { byName } from './byName';
import { FileRow, FolderRow } from './tree';

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

  const renderFolder = (
    node: FolderNode,
    depth: number,
  ): React.ReactElement[] => [
    ...[...node.folders.values()].toSorted(byName).flatMap((child) => {
      const open = expanded.has(child.path);
      return [
        <FolderRow
          key={`folder:${child.path}`}
          path={child.path}
          depth={depth}
          open={open}
          className={child.changed ? 'changed' : ''}
          onToggle={onToggle}
        >
          {child.name}
        </FolderRow>,
        ...(open ? renderFolder(child, depth + 1) : []),
      ];
    }),
    ...node.files
      .toSorted(byName)
      .map((file) => (
        <FileRow
          key={`file:${file.path}`}
          path={file.path}
          name={file.name}
          depth={depth}
          change={changes.get(file.path)}
          selected={selected}
          onSelect={onSelect}
        />
      )),
  ];

  return (
    <VirtualRows
      rows={renderFolder(tree, 0)}
      selectedKey={selected === undefined ? undefined : `file:${selected}`}
    />
  );
}
