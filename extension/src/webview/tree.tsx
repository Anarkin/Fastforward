import type { FileChange } from '../shared/protocol';
import { changeTitle, statusClass } from './fileStatus';
import { LineCounts } from './lineCounts';

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

export const fileRowKey = (path: string) => `file:${path}`;

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
  className: string;
  onToggle: (folder: string) => void;
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
  depth?: number;
  change: FileChange | undefined;
  selected: string | undefined;
  onSelect: (path: string | undefined) => void;
}) {
  return (
    <div
      className={`row ${depth === undefined ? '' : 'tree-row'} file ${path === selected ? 'selected' : ''}`}
      style={
        depth === undefined
          ? undefined
          : { paddingLeft: treeIndent(depth) + twistyWidth }
      }
      title={change ? changeTitle(change) : path}
      onClick={() => onSelect(path === selected ? undefined : path)}
    >
      {depth !== undefined && <IndentGuides depth={depth} />}
      <span className={change ? statusClass(change) : 'path'}>{name}</span>
      {change && <LineCounts {...change} />}
    </div>
  );
}
