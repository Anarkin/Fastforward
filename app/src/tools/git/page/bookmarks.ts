import { folded } from '../../../shared/textMatches';
import { shortHash } from '../shared/hashes';
import type { RefInfo, Bookmark, BookmarkRef } from '../shared/protocol';
import {
  findRef,
  hasRef,
  refOf,
  sameRef,
  withoutRemote,
} from '../shared/refNames';

const kindOrder: Record<BookmarkRef['kind'], number> = {
  branch: 0,
  remote: 1,
  tag: 2,
  'remote-tag': 3,
};

type SortedBookmark = Bookmark & { readonly remote?: string };

function onRemote(bookmark: Bookmark): boolean {
  return bookmark.kind === 'remote' || bookmark.kind === 'remote-tag';
}

function sortName(bookmark: SortedBookmark): string {
  return onRemote(bookmark)
    ? withoutRemote(bookmark.name, bookmark.remote)
    : bookmark.name;
}

export function compareBookmarks(a: SortedBookmark, b: SortedBookmark): number {
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
      .toSorted(compareBookmarks)
      .map(refOf)
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

export function searchedBookmarks(
  bookmarks: readonly Bookmark[],
  refs: readonly RefInfo[],
  query: string,
): Bookmark[] {
  const needle = folded(query.trim());
  return bookmarks
    .filter((bookmark) => folded(bookmark.name).includes(needle))
    .map((bookmark): [Bookmark, SortedBookmark] => [
      bookmark,
      onRemote(bookmark) ? (findRef(refs, bookmark) ?? bookmark) : bookmark,
    ])
    .toSorted(([, a], [, b]) => compareBookmarks(a, b))
    .map(([bookmark]) => bookmark);
}
