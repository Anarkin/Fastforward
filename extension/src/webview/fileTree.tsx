import { useMemo } from 'react';
import type { FileChange } from '../protocol';
import { IndentGuides, treeIndent, twistyWidth } from './tree';

interface FolderNode {
  readonly name: string;
  readonly path: string;
  readonly folders: Map<string, FolderNode>;
  readonly files: { name: string; path: string }[];
  // Whether a file in it, at any depth, is one the commit changed
  changed: boolean;
}

function folder(name: string, path: string): FolderNode {
  return { name, path, folders: new Map(), files: [], changed: false };
}

// Every file of the repository as folders, including the files the commit
// deleted, which aren't in the repository at it anymore
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
    const parts = path.split('/');
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

// The folders a path is in, to open them so it is visible
export function foldersOf(path: string): string[] {
  const parts = path.split('/');
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

// The whole repository at the selected commit, like the Explorer, with the
// commit's changes marked
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

  const renderFolder = (node: FolderNode, depth: number): React.ReactNode[] => [
    ...[...node.folders.values()].toSorted(byName).flatMap((child) => {
      const open = expanded.has(child.path);
      return [
        <div
          key={`folder:${child.path}`}
          className={`row tree-row folder ${child.changed ? 'changed' : ''}`}
          style={{ paddingLeft: treeIndent(depth) }}
          title={child.path}
          onClick={() => onToggle(child.path)}
        >
          <IndentGuides depth={depth} />
          <span className="twisty">{open ? '▾' : '▸'}</span>
          {child.name}
        </div>,
        ...(open ? renderFolder(child, depth + 1) : []),
      ];
    }),
    ...node.files.toSorted(byName).map((file) => {
      const change = changes.get(file.path);
      return (
        <div
          key={`file:${file.path}`}
          className={`row tree-row file ${file.path === selected ? 'selected' : ''} ${change ? 'changed' : ''}`}
          // Past the twisty space, so files line up with sibling folders
          style={{ paddingLeft: treeIndent(depth) + twistyWidth }}
          title={file.path}
          ref={(element) => {
            if (element && file.path === selected) {
              element.scrollIntoView({ block: 'nearest' });
            }
          }}
          onClick={() =>
            onSelect(file.path === selected ? undefined : file.path)
          }
        >
          <IndentGuides depth={depth} />
          {change && (
            <span className={`status status-${change.status}`}>
              {change.status}
            </span>
          )}
          <span className="path">{file.name}</span>
        </div>
      );
    }),
  ];

  return <>{renderFolder(tree, 0)}</>;
}
