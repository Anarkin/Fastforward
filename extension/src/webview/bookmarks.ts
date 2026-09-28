import type { RefInfo, Bookmark, BookmarkRef } from '../protocol';
import { sameRef, withoutRemote } from '../refNames';

// A-Z, with a remote branch next to the local one of the same name: origin/main
// sorts as main, after main itself, and a tag of the same name after both;
// commits come after every ref, in the order they were added
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

// What of a commit can be a bookmark: its refs, in the order of the
// bookmarks row, then the commit itself
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
      label: hash.slice(0, 7),
      bookmark: { kind: 'commit', name: hash },
    },
  ];
}

// The bubbles row: the bookmarks, sorted, and the checked-out branch and the
// branch it tracks as a pair; a checked-out bookmark stays in its place, as
// a pair or as the detached HEAD's bubble, so the row doesn't shift when
// checking out, and anything else checked out follows the bookmarks, set
// apart, as it is only there while checked out
export interface BubbleRow {
  readonly branch: BookmarkRef | undefined;
  readonly upstream: BookmarkRef | undefined;
  // Including a checked-out bookmark, whose place the pair or HEAD bubble
  // takes; the upstream is left out, as it shows in the pair
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
  const exists = (bookmark: BookmarkRef) =>
    refs.some(
      (ref) => ref.kind === bookmark.kind && ref.name === bookmark.name,
    );
  const isBookmark = (bookmark: Bookmark) =>
    bookmarks.some((other) => sameRef(other, bookmark));
  const branch: BookmarkRef | undefined =
    head && exists({ kind: 'branch', name: head })
      ? { kind: 'branch', name: head }
      : undefined;
  const upstream: BookmarkRef | undefined =
    branch && headUpstream && exists({ kind: 'remote', name: headUpstream })
      ? { kind: 'remote', name: headUpstream }
      : undefined;
  return {
    branch,
    upstream,
    bookmarks: bookmarks
      .filter((bookmark) => !(upstream && sameRef(bookmark, upstream)))
      .toSorted(compareBookmarks),
    checkedOutIsBookmark: detached
      ? isBookmark({ kind: 'commit', name: detached })
      : branch !== undefined && isBookmark(branch),
  };
}
