import type { FileChange } from '../shared/protocol';
import { changeTitle, statusClass } from './fileStatus';
import { LineCounts } from './lineCounts';

// Like VS Code's trees: a level is indented by its parent's twisty, and a
// guide runs down from each ancestor's twisty
const treePadding = 8;
export const twistyWidth = 10;

export function treeIndent(depth: number): number {
  return treePadding + depth * twistyWidth;
}

export function IndentGuides({ depth }: { depth: number }) {
  return (
    <>
      {Array.from({ length: depth }, (_, level) => (
        <span
          key={level}
          className="indent-guide"
          style={{ left: treeIndent(level) + twistyWidth / 2 }}
        />
      ))}
    </>
  );
}

// Folders and files each A-Z
export const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

// A folder of the Files column's trees, which a click opens or closes
export function FolderRow({
  path,
  depth,
  open,
  className,
  onToggle,
  children,
}: {
  path: string;
  depth: number;
  open: boolean;
  // Besides the row's own classes
  className: string;
  onToggle: (folder: string) => void;
  // Its name
  children: React.ReactNode;
}) {
  return (
    <div
      className={`row tree-row folder ${className}`}
      style={{ paddingLeft: treeIndent(depth) }}
      title={path}
      onClick={() => onToggle(path)}
    >
      <IndentGuides depth={depth} />
      <span className="twisty">{open ? '▾' : '▸'}</span>
      {children}
    </div>
  );
}

// A file of the Files column's trees, in its change's color when the commit
// changed it; a click selects it, or clears the selection when it is selected
export function FileRow({
  path,
  name,
  depth,
  change,
  selected,
  onSelect,
}: {
  path: string;
  name: string;
  depth: number;
  change: FileChange | undefined;
  selected: string | undefined;
  onSelect: (path: string | undefined) => void;
}) {
  return (
    <div
      className={`row tree-row file ${path === selected ? 'selected' : ''}`}
      // Past the twisty space, so files line up with sibling folders
      style={{ paddingLeft: treeIndent(depth) + twistyWidth }}
      title={change ? changeTitle(change) : path}
      onClick={() => onSelect(path === selected ? undefined : path)}
    >
      <IndentGuides depth={depth} />
      <span className={change ? statusClass(change) : 'path'}>{name}</span>
      {change && (
        <LineCounts
          deletions={change.deletions}
          insertions={change.insertions}
        />
      )}
    </div>
  );
}
