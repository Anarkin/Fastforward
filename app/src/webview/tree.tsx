import type { FileChange } from '../shared/protocol';
import { strings } from '../shared/strings';
import { changeTitle, changeClass } from './fileStatus';

const treePadding = 8;
export const twistyWidth = 10;

export function treeIndent(depth: number): number {
  return treePadding + depth * twistyWidth;
}

export const fileRowKey = (path: string) => `file:${path}`;

export function Twisty({ open }: { open: boolean }) {
  return (
    <span className="twisty">
      {open ? strings.symbols.open : strings.symbols.closed}
    </span>
  );
}

export function FolderRow({
  path,
  title,
  depth,
  open,
  className,
  style,
  onToggle,
  children,
}: {
  path: string;
  title?: string;
  depth: number;
  open: boolean;
  className: string;
  style?: React.CSSProperties;
  onToggle: (folder: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`row tree-row folder ${className}`}
      style={{ paddingLeft: treeIndent(depth), ...style }}
      title={title}
      onClick={() => onToggle(path)}
    >
      <Twisty open={open} />
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
  marked,
  onSelect,
}: {
  path: string;
  name: string;
  depth: number;
  change: FileChange | undefined;
  selected: string | undefined;
  marked: boolean;
  onSelect: (path: string | undefined) => void;
}) {
  return (
    <div
      className={`row tree-row file ${marked ? 'selected' : ''}`}
      style={{ paddingLeft: treeIndent(depth) + twistyWidth }}
      title={change ? changeTitle(change) : path}
      onClick={() => onSelect(path === selected ? undefined : path)}
    >
      <span className={changeClass(change)}>{name}</span>
    </div>
  );
}
