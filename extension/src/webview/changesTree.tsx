import { useMemo } from 'react';
import type { FileChange } from '../protocol';
import { buildFileTree, type FolderNode } from './fileTree';
import { LineCounts } from './lineCounts';
import { IndentGuides, treeIndent, twistyWidth } from './tree';

export type ChangesTreeRow =
  | {
      readonly kind: 'folder';
      // Folders with a single folder in them are one row, like "src/app"
      readonly name: string;
      readonly path: string;
      readonly depth: number;
      readonly open: boolean;
      // Summed over the files in it, at any depth
      readonly deletions: number;
      readonly insertions: number;
    }
  | {
      readonly kind: 'file';
      readonly name: string;
      readonly change: FileChange;
      readonly depth: number;
    };

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

// Merges a folder that has nothing but one folder in it with that folder, so
// a deep path doesn't become a staircase of rows
function compact(node: FolderNode): FolderNode {
  let merged = node;
  while (merged.files.length === 0 && merged.folders.size === 1) {
    const [only] = merged.folders.values();
    merged = { ...only, name: `${merged.name}/${only.name}` };
  }
  return merged;
}

// The changed files as folders, which are open unless closed, folders first
export function changesTreeRows(
  files: readonly FileChange[],
  closed: ReadonlySet<string>,
): ChangesTreeRow[] {
  const changes = new Map(files.map((file) => [file.path, file]));
  const rows: ChangesTreeRow[] = [];
  const sum = (node: FolderNode): { deletions: number; insertions: number } =>
    [...node.folders.values()].map(sum).reduce(
      (total, counts) => ({
        deletions: total.deletions + counts.deletions,
        insertions: total.insertions + counts.insertions,
      }),
      node.files.reduce(
        (total, file) => ({
          deletions: total.deletions + (changes.get(file.path)?.deletions ?? 0),
          insertions:
            total.insertions + (changes.get(file.path)?.insertions ?? 0),
        }),
        { deletions: 0, insertions: 0 },
      ),
    );
  const add = (node: FolderNode, depth: number) => {
    for (const child of [...node.folders.values()]
      .map(compact)
      .toSorted(byName)) {
      const open = !closed.has(child.path);
      rows.push({
        kind: 'folder',
        name: child.name,
        path: child.path,
        depth,
        open,
        ...sum(child),
      });
      if (open) {
        add(child, depth + 1);
      }
    }
    for (const file of node.files.toSorted(byName)) {
      const change = changes.get(file.path);
      if (change) {
        rows.push({ kind: 'file', name: file.name, change, depth });
      }
    }
  };
  add(buildFileTree([], changes), 0);
  return rows;
}

// The Changes tab viewed as a tree, to see which parts of the repository a
// change touches
export function ChangesTree({
  files,
  closed,
  onToggle,
  selected,
  onSelect,
}: {
  files: readonly FileChange[];
  closed: ReadonlySet<string>;
  onToggle: (folder: string) => void;
  selected: string | undefined;
  onSelect: (path: string | undefined) => void;
}) {
  const rows = useMemo(() => changesTreeRows(files, closed), [files, closed]);
  return (
    <>
      {rows.map((row) =>
        row.kind === 'folder' ? (
          <div
            key={`folder:${row.path}`}
            className="row tree-row folder counted"
            style={{ paddingLeft: treeIndent(row.depth) }}
            title={row.path}
            onClick={() => onToggle(row.path)}
          >
            <IndentGuides depth={row.depth} />
            <span className="twisty">{row.open ? '▾' : '▸'}</span>
            <span className="path">{row.name}</span>
            <LineCounts deletions={row.deletions} insertions={row.insertions} />
          </div>
        ) : (
          <div
            key={`file:${row.change.path}`}
            className={`row tree-row file ${row.change.path === selected ? 'selected' : ''}`}
            // Past the twisty space, so files line up with sibling folders
            style={{ paddingLeft: treeIndent(row.depth) + twistyWidth }}
            title={
              row.change.oldPath
                ? `${row.change.oldPath} → ${row.change.path}`
                : row.change.path
            }
            onClick={() =>
              onSelect(
                row.change.path === selected ? undefined : row.change.path,
              )
            }
          >
            <IndentGuides depth={row.depth} />
            <span className={`status status-${row.change.status}`}>
              {row.change.status}
            </span>
            <span className="path">{row.name}</span>
            <LineCounts
              deletions={row.change.deletions}
              insertions={row.change.insertions}
            />
          </div>
        ),
      )}
    </>
  );
}
