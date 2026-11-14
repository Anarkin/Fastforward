import type { RefKind, StashInfo } from '../shared/protocol';
import { useOpenMenu, refMenuTarget } from './menus';
import { FolderRow, treeIndent, twistyWidth } from './tree';
import { strings } from '../../../lib/shared/strings';
import type { TreeNode } from './refIndex';

import {
  maxResults,
  RefLabel,
  PinnedResult,
  ResultItem,
  stashKey,
  refKey,
  folderKey,
  itemKey,
} from './locationsSearch';

export type BrowseRow =
  | {
      readonly kind: 'jump';
      readonly key: string;
      readonly commit: string | undefined;
    }
  | { readonly kind: 'folder'; readonly key: string };

function folderOpen(
  toggled: ReadonlySet<string>,
  key: string,
  depth: number,
  siblings: number,
): boolean {
  return (depth === 0 && siblings === 1) !== toggled.has(key);
}

function treeRows(
  node: TreeNode,
  kind: RefKind,
  toggled: ReadonlySet<string>,
  depth = 0,
  prefix = '',
): BrowseRow[] {
  return shownChildren(node.children).shown.flatMap((child): BrowseRow[] => {
    const path = `${prefix}${child.name}`;
    if (child.children.length === 0) {
      return child.ref
        ? [{ kind: 'jump', key: refKey(child.ref), commit: child.ref.commit }]
        : [];
    }
    const key = folderKey(kind, path);
    return [
      { kind: 'folder', key },
      ...(folderOpen(toggled, key, depth, node.children.length)
        ? treeRows(child, kind, toggled, depth + 1, `${path}/`)
        : []),
    ];
  });
}

export function browseRows(
  pinned: readonly PinnedResult[],
  trees: readonly { kind: RefKind; tree: TreeNode }[],
  toggled: ReadonlySet<string>,
  stashes: readonly StashInfo[],
): BrowseRow[] {
  return [
    ...pinned.map((item): BrowseRow => ({
      kind: 'jump',
      key: itemKey(item),
      commit: item.commit,
    })),
    ...trees.flatMap(({ kind, tree }) => treeRows(tree, kind, toggled)),
    ...stashes.map((stash): BrowseRow => ({
      kind: 'jump',
      key: stashKey(stash),
      commit: stash.commit,
    })),
  ];
}

export interface Rows {
  readonly tree: boolean;
  readonly id: (key: string) => string;
  readonly active: string | undefined;
  readonly toggled: ReadonlySet<string>;
  readonly onToggle: (key: string) => void;
}

export function rowProps(
  rows: Rows,
  key: string,
  level: number,
): React.HTMLAttributes<HTMLDivElement> {
  return {
    id: rows.id(key),
    role: rows.tree ? 'treeitem' : 'option',
    'aria-selected': key === rows.active,
    'aria-level': rows.tree ? level : undefined,
  };
}

export const activeClass = (rows: Rows, key: string | undefined) =>
  key !== undefined && key === rows.active ? 'active' : '';

export interface Highlighted {
  readonly query: string;
  readonly key: string;
}

export function currentActive(
  items: readonly ResultItem[],
  query: string,
  highlight: Highlighted | undefined,
): number {
  if (highlight?.query === query) {
    const index = items.findIndex((item) => itemKey(item) === highlight.key);
    if (index >= 0) {
      return index;
    }
  }
  return 0;
}

export function nextActive(
  items: readonly unknown[],
  active: number,
  step: 1 | -1,
): number {
  return Math.max(0, Math.min(items.length - 1, active + step));
}

export function shownChildren(
  children: readonly TreeNode[],
  limit = maxResults,
): { shown: readonly TreeNode[]; more: number } {
  return {
    shown: children.slice(0, limit),
    more: Math.max(0, children.length - limit),
  };
}

export function RefTree({
  kind,
  tree,
  rows,
  onSelect,
}: {
  kind: RefKind;
  tree: TreeNode;
  rows: Rows;
  onSelect: (commit: string) => void;
}) {
  if (tree.children.length === 0) {
    return <div className="locations-empty">{strings.search.none}</div>;
  }
  return (
    <TreeChildren
      kind={kind}
      node={tree}
      depth={0}
      prefix=""
      rows={rows}
      onSelect={onSelect}
    />
  );
}

function TreeChildren({
  kind,
  node,
  depth,
  prefix,
  rows,
  onSelect,
}: {
  kind: RefKind;
  node: TreeNode;
  depth: number;
  prefix: string;
  rows: Rows;
  onSelect: (commit: string) => void;
}) {
  const openMenu = useOpenMenu();
  const { children } = node;
  const withFolders = children.some((child) => child.children.length > 0);
  const { shown, more } = shownChildren(children);
  return (
    <>
      {shown.map((child) =>
        child.children.length > 0 ? (
          <TreeFolder
            key={child.name}
            kind={kind}
            node={child}
            depth={depth}
            path={`${prefix}${child.name}`}
            siblings={children.length}
            rows={rows}
            onSelect={onSelect}
          />
        ) : (
          <div
            key={child.name}
            {...(child.ref && rowProps(rows, refKey(child.ref), depth + 1))}
            className={`row tree-row leaf ${activeClass(rows, child.ref && refKey(child.ref))}`}
            style={{ paddingLeft: leafIndent(depth, withFolders) }}
            title={child.ref?.name}
            onClick={() => child.ref && onSelect(child.ref.commit)}
            onContextMenu={(event) =>
              child.ref && openMenu(event, refMenuTarget(child.ref))
            }
          >
            {child.ref ? (
              <RefLabel info={child.ref}>{child.name}</RefLabel>
            ) : (
              child.name
            )}
          </div>
        ),
      )}
      {more > 0 && (
        <div
          className="locations-empty"
          style={{ paddingLeft: leafIndent(depth, withFolders) }}
        >
          {strings.search.moreInFolder(more)}
        </div>
      )}
    </>
  );
}

function TreeFolder({
  kind,
  node,
  depth,
  path,
  siblings,
  rows,
  onSelect,
}: {
  kind: RefKind;
  node: TreeNode;
  depth: number;
  path: string;
  siblings: number;
  rows: Rows;
  onSelect: (commit: string) => void;
}) {
  const key = folderKey(kind, path);
  const open = folderOpen(rows.toggled, key, depth, siblings);
  return (
    <div className="tree-group">
      <FolderRow
        path={node.name}
        depth={depth}
        open={open}
        className={`sticky ${activeClass(rows, key)}`}
        style={{ top: stuckRowTop(depth), zIndex: 100 - depth }}
        onToggle={() => rows.onToggle(key)}
        itemProps={{
          ...rowProps(rows, key, depth + 1),
          'aria-expanded': open,
        }}
      >
        {node.name}
      </FolderRow>
      {open && (
        <TreeChildren
          kind={kind}
          node={node}
          depth={depth + 1}
          prefix={`${path}/`}
          rows={rows}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}

export function stuckRowTop(depth: number): string {
  return `calc(${depth} * var(--row-line-height))`;
}

export function leafIndent(depth: number, withFolders: boolean): number {
  return treeIndent(depth) + (withFolders ? twistyWidth : 0);
}
