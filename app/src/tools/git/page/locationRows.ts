import type { RefKind, StashInfo } from '../shared/protocol';
import { treeIndent, twistyWidth } from './treeLayout';
import type { TreeNode } from './refIndex';
import {
  maxResults,
  PinnedResult,
  ResultItem,
  stashKey,
  refKey,
  folderKey,
  itemKey,
} from './locationResults';

export type BrowseRow =
  | {
      readonly kind: 'jump';
      readonly key: string;
      readonly commit: string | undefined;
    }
  | { readonly kind: 'folder'; readonly key: string };

export function folderOpen(
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

export function stuckRowTop(depth: number): string {
  return `calc(${depth} * var(--row-line-height))`;
}

export function leafIndent(depth: number, withFolders: boolean): number {
  return treeIndent(depth) + (withFolders ? twistyWidth : 0);
}
