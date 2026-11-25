import { tip } from './tips';
import type { FileChange } from '../shared/changes';
import { strings } from '../shared/strings';
import {
  changeClass,
  changeKind,
  changeMark,
  changeMeaning,
} from './fileStatus';
import { CutPathName } from './pathName';
import { noFilter, type Filter } from '../shared/filter';
import { treeIndent, twistyWidth } from './treeLayout';

function MarkStrip({
  change,
  indent,
}: {
  change: FileChange | undefined;
  indent: number;
}) {
  return (
    <>
      <span
        className={
          change === undefined
            ? 'change-mark'
            : `change-mark ${changeKind(change)}`
        }
        aria-hidden="true"
        {...(change !== undefined && tip(changeMeaning(change)))}
      >
        {changeMark(change)}
      </span>
      <span className="tree-indent" style={{ width: indent }} />
    </>
  );
}

export function Twisty({ open }: { open: boolean }) {
  return (
    <span className="twisty">
      {open ? strings.symbols.open : strings.symbols.closed}
    </span>
  );
}

export function FolderRow({
  path,
  depth,
  open,
  marks = false,
  className,
  style,
  onToggle,
  itemProps,
  children,
}: {
  path: string;
  depth: number;
  open: boolean;
  marks?: boolean;
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
      style={{
        paddingLeft: marks ? treeIndent(0) : treeIndent(depth),
        ...style,
      }}
      onClick={() => onToggle(path)}
    >
      {marks && (
        <MarkStrip
          change={undefined}
          indent={treeIndent(depth) - treeIndent(0)}
        />
      )}
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
      style={{ paddingLeft: treeIndent(0) }}
      onClick={() => onSelect(path === selected ? undefined : path)}
    >
      <MarkStrip
        change={change}
        indent={treeIndent(depth) - treeIndent(0) + twistyWidth}
      />
      <CutPathName
        className={changeClass(change)}
        path={name}
        file
        {...(root !== undefined && { root })}
        filter={filter}
      />
    </div>
  );
}
