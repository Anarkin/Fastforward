import { shortHash } from '../shared/hashes';
import type { RefInfo, Bookmark, BookmarkRef } from '../shared/protocol';
import { hasRef, refOf, sameRef, withoutRemote } from '../shared/refNames';

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
      .map(refOf)
      .toSorted(compareBookmarks)
      .map((bookmark) => ({ label: bookmark.name, bookmark })),
    {
      label: shortHash(hash),
      bookmark: { kind: 'commit', name: hash },
    },
  ];
}

export function toggleBookmark(
  bookmarks: readonly Bookmark[],
  bookmark: Bookmark,
): Bookmark[] {
  return hasRef(bookmarks, bookmark)
    ? bookmarks.filter((other) => !sameRef(other, bookmark))
    : [...bookmarks, bookmark];
}

function checkedOutRefs(
  refs: readonly RefInfo[],
  head: string | undefined,
): BookmarkRef[] {
  return head && hasRef(refs, { kind: 'branch', name: head })
    ? [{ kind: 'branch', name: head }]
    : [];
}

export interface PinnedRefs {
  readonly checkedOut: readonly Bookmark[];
  readonly bookmarks: readonly Bookmark[];
}

export function pinnedRefs(
  bookmarks: readonly Bookmark[],
  refs: readonly RefInfo[],
  head: string | undefined,
  detached: string | undefined,
  query: string,
): PinnedRefs {
  const needle = query.trim().toLowerCase();
  const matches = (bookmark: Bookmark) =>
    bookmark.name.toLowerCase().includes(needle);
  const checkedOut: Bookmark[] = detached
    ? [{ kind: 'commit', name: detached }]
    : checkedOutRefs(refs, head);
  return {
    checkedOut: checkedOut.filter(matches),
    bookmarks: bookmarks.toSorted(compareBookmarks).filter(matches),
  };
}
