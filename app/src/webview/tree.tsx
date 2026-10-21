import type { FileChange } from '../shared/protocol';
import { strings } from '../shared/strings';
import { changeTitle, changeClass, changeKind } from './fileStatus';
import { HighlightWords } from './highlight';
import { ChangeIcon, LinkIcon } from './icons';

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
  itemProps,
  children,
}: {
  path: string;
  title?: string;
  depth: number;
  open: boolean;
  className: string;
  style?: React.CSSProperties;
  onToggle: (folder: string) => void;
  itemProps?: React.HTMLAttributes<HTMLDivElement>;
  children: React.ReactNode;
}) {
  return (
    <div
      {...itemProps}
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
  words = [],
}: {
  path: string;
  name: string;
  depth: number;
  change: FileChange | undefined;
  selected: string | undefined;
  marked: boolean;
  onSelect: (path: string | undefined) => void;
  words?: readonly string[];
}) {
  return (
    <div
      className={`row tree-row file ${marked ? 'selected' : ''}`}
      style={{ paddingLeft: treeIndent(depth) + twistyWidth }}
      title={change ? changeTitle(change) : path}
      onClick={() => onSelect(path === selected ? undefined : path)}
    >
      {change && <ChangeIcon kind={changeKind(change)} />}
      <span className={changeClass(change)}>
        <HighlightWords text={name} words={words} />
      </span>
      {change?.link && <LinkIcon />}
    </div>
  );
}
