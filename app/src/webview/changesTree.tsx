import type { FileChange } from '../shared/protocol';
import { buildFileTree, type FolderNode } from './fileTree';
import { byName } from './byName';
import { FileRow, fileRowKey, FolderRow } from './tree';

export type ChangesTreeRow =
  | {
      readonly kind: 'folder';
      readonly name: string;
      readonly path: string;
      readonly depth: number;
      readonly open: boolean;
    }
  | {
      readonly kind: 'file';
      readonly name: string;
      readonly change: FileChange;
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
): ChangesTreeRow[] {
  const changes = new Map(files.map((file) => [file.path, file]));
  const rows: ChangesTreeRow[] = [];
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

export function changesTreeElements({
  rows,
  onToggle,
  selected,
  onSelect,
}: {
  rows: readonly ChangesTreeRow[];
  onToggle: (folder: string) => void;
  selected: string | undefined;
  onSelect: (path: string | undefined) => void;
}): React.ReactElement[] {
  return rows.map((row) =>
    row.kind === 'folder' ? (
      <FolderRow
        key={`folder:${row.path}`}
        path={row.path}
        title={row.path}
        depth={row.depth}
        open={row.open}
        className="counted"
        onToggle={onToggle}
      >
        <span className="path">{row.name}</span>
      </FolderRow>
    ) : (
      <FileRow
        key={fileRowKey(row.change.path)}
        path={row.change.path}
        name={row.name}
        depth={row.depth}
        change={row.change}
        inChanges
        selected={selected}
        onSelect={onSelect}
      />
    ),
  );
}
