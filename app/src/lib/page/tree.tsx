import { namedFile, type Sentence } from '../shared/sentences';
import { tip } from './tips';
import type { FileChange } from '../shared/changes';
import { strings } from '../shared/strings';
import { changeTitle, changeClass, changeKind } from './fileStatus';
import { PathName } from './pathName';
import { noFilter, type Filter } from '../shared/filter';
import { ChangeIcon, LinkIcon } from './icons';
import { treeIndent, twistyWidth } from './treeLayout';

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
  title?: Sentence;
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
      {...tip(title)}
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
  root,
  depth,
  change,
  selected,
  marked,
  onSelect,
  filter = noFilter,
}: {
  path: string;
  name: string;
  root?: string | undefined;
  depth: number;
  change: FileChange | undefined;
  selected: string | undefined;
  marked: boolean;
  onSelect: (path: string | undefined) => void;
  filter?: Filter;
}) {
  return (
    <div
      className={`row tree-row file ${marked ? 'selected' : ''}`}
      style={{ paddingLeft: treeIndent(depth) + twistyWidth }}
      {...tip(change ? changeTitle(change, root) : [namedFile(path, root)])}
      onClick={() => onSelect(path === selected ? undefined : path)}
    >
      {change && <ChangeIcon kind={changeKind(change)} />}
      <span className={changeClass(change)}>
        <PathName path={name} file root={root} filter={filter} />
      </span>
      {change?.link && <LinkIcon />}
    </div>
  );
}
