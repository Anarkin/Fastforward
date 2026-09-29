import { shortHash } from '../shared/hashes';
import type { RefInfo, Bookmark, BookmarkRef } from '../shared/protocol';
import { hasRef, sameRef, withoutRemote } from '../shared/refNames';

const kindOrder: Record<BookmarkRef['kind'], number> = {
  branch: 0,
  remote: 1,
  tag: 2,
};

function sortName(bookmark: BookmarkRef): string {
  return bookmark.kind === 'remote'
    ? withoutRemote(bookmark.name)
    : bookmark.name;
}

export function compareBookmarks(a: Bookmark, b: Bookmark): number {
  if (a.kind === 'commit' || b.kind === 'commit') {
    return Number(a.kind === 'commit') - Number(b.kind === 'commit');
  }
  const options = { sensitivity: 'base' } as const;
  return (
    sortName(a).localeCompare(sortName(b), undefined, options) ||
    kindOrder[a.kind] - kindOrder[b.kind] ||
    a.name.localeCompare(b.name, undefined, options)
  );
}

export interface BookmarkOption {
  readonly label: string;
  readonly bookmark: Bookmark;
}

export function bookmarkOptions(
  hash: string,
  refs: readonly RefInfo[],
): BookmarkOption[] {
  return [
    ...refs
      .filter((ref) => ref.commit === hash)
      .map((ref): Bookmark => ({ kind: ref.kind, name: ref.name }))
      .toSorted(compareBookmarks)
      .map((bookmark) => ({ label: bookmark.name, bookmark })),
    {
      label: shortHash(hash),
      bookmark: { kind: 'commit', name: hash },
    },
  ];
}

export interface BubbleRow {
  readonly branch: BookmarkRef | undefined;
  readonly upstream: BookmarkRef | undefined;
  readonly bookmarks: Bookmark[];
  readonly checkedOutIsBookmark: boolean;
}

export function bubbleRow(
  bookmarks: readonly Bookmark[],
  refs: readonly RefInfo[],
  head: string | undefined,
  headUpstream: string | undefined,
  detached?: string,
): BubbleRow {
  const branch: BookmarkRef | undefined =
    head && hasRef(refs, { kind: 'branch', name: head })
      ? { kind: 'branch', name: head }
      : undefined;
  const upstream: BookmarkRef | undefined =
    branch &&
    headUpstream &&
    hasRef(refs, { kind: 'remote', name: headUpstream })
      ? { kind: 'remote', name: headUpstream }
      : undefined;
  return {
    branch,
    upstream,
    bookmarks: bookmarks
      .filter((bookmark) => !(upstream && sameRef(bookmark, upstream)))
      .toSorted(compareBookmarks),
    checkedOutIsBookmark: detached
      ? hasRef(bookmarks, { kind: 'commit', name: detached })
      : branch !== undefined && hasRef(bookmarks, branch),
  };
}
