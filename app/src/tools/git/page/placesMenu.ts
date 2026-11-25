import type { ContextMenuItem } from '../../../lib/page/contextMenuItem';
import { shortHash } from '../../../lib/shared/hashes';
import { strings } from '../../../lib/shared/strings';
import type { Bookmark, RefInfo, StashInfo } from '../shared/protocol';
import { findRef } from '../shared/refNames';
import type { RefGroup, TreeNode } from './refIndex';

export interface Places {
  readonly bookmarks: readonly Bookmark[];
  readonly refs: readonly RefInfo[];
  readonly groups: readonly RefGroup[];
  readonly stashes: readonly StashInfo[];
}

const leaf = (
  label: string,
  full: string,
  commit: string | undefined,
  onJump: (commit: string) => void,
): ContextMenuItem => ({
  label,
  keywords: full,
  disabled: commit === undefined,
  onClick: () => {
    if (commit !== undefined) {
      onJump(commit);
    }
  },
});

function treeItems(
  node: TreeNode,
  onJump: (commit: string) => void,
): ContextMenuItem[] {
  return node.children.map((child) =>
    child.children.length === 0
      ? leaf(
          child.name,
          child.ref?.name ?? child.name,
          child.ref?.commit,
          onJump,
        )
      : {
          label: child.name,
          submenu: [
            ...(child.ref === undefined
              ? []
              : [leaf(child.name, child.ref.name, child.ref.commit, onJump)]),
            ...treeItems(child, onJump),
          ],
        },
  );
}

const group = (
  label: string,
  items: readonly ContextMenuItem[],
): ContextMenuItem => ({
  label,
  filtered: true,
  disabled: items.length === 0,
  submenu: items,
});

const divider: ContextMenuItem = { separator: true };

export function placesMenu(
  { bookmarks, refs, groups, stashes }: Places,
  onJump: (commit: string) => void,
): ContextMenuItem[] {
  const bookmarked = bookmarks.map((bookmark) =>
    leaf(
      bookmark.kind === 'commit' ? shortHash(bookmark.name) : bookmark.name,
      bookmark.name,
      bookmark.kind === 'commit'
        ? bookmark.name
        : findRef(refs, bookmark)?.commit,
      onJump,
    ),
  );
  return [
    ...bookmarked,
    ...(bookmarked.length > 0 ? [divider] : []),
    ...groups.map((each) => group(each.title, treeItems(each.tree, onJump))),
    group(
      strings.search.stashes,
      stashes.map((stash) =>
        leaf(
          stash.message,
          `${stash.name} ${stash.message}`,
          stash.commit,
          onJump,
        ),
      ),
    ),
  ];
}
