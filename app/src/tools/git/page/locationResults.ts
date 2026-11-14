import type {
  Bookmark,
  CommitInfo,
  RefInfo,
  RefKind,
  StashInfo,
} from '../shared/protocol';
import { findRef } from '../shared/refNames';
import { folded } from '../../../lib/shared/textMatches';
import type { RefGroup } from './refIndex';

export const maxResults = 200;

export interface SearchGroup {
  readonly kind: RefKind;
  readonly title: string;
  readonly refs: readonly RefInfo[];
  readonly more: number;
}

export function searchRefs(
  index: readonly RefGroup[],
  query: string,
  limit = maxResults,
): SearchGroup[] {
  const needle = folded(query.trim());
  return index.map(({ kind, title, refs, names }) => {
    const found: RefInfo[] = [];
    let more = 0;
    if (needle) {
      for (const [i, name] of names.entries()) {
        if (!name.includes(needle)) {
          continue;
        }
        if (found.length < limit) {
          found.push(refs[i]);
        } else {
          more++;
        }
      }
    }
    return { kind, title, refs: found, more };
  });
}

export interface StashSearch {
  readonly stashes: readonly StashInfo[];
  readonly more: number;
}

const noStashes: StashSearch = { stashes: [], more: 0 };

export const noStashList: readonly StashInfo[] = [];

export function searchStashes(
  stashes: readonly StashInfo[],
  query: string,
  limit = maxResults,
): StashSearch {
  const needle = folded(query.trim());
  if (!needle) {
    return noStashes;
  }
  const found = stashes.filter((stash) =>
    [stash.name, stash.message].some((text) => folded(text).includes(needle)),
  );
  return cappedStashes(found, limit);
}

export function shownStashes(
  stashes: readonly StashInfo[],
  query: string,
  limit = maxResults,
): StashSearch {
  return query.trim()
    ? searchStashes(stashes, query, limit)
    : cappedStashes(stashes, limit);
}

function cappedStashes(
  stashes: readonly StashInfo[],
  limit: number,
): StashSearch {
  return {
    stashes: stashes.slice(0, limit),
    more: Math.max(0, stashes.length - limit),
  };
}

export interface PinnedResult {
  readonly kind: 'pinned';
  readonly bookmark: Bookmark;
  readonly commit: string | undefined;
}

export type ResultItem =
  | { readonly kind: 'commit'; readonly commit: CommitInfo }
  | { readonly kind: 'ref'; readonly ref: RefInfo }
  | { readonly kind: 'stash'; readonly stash: StashInfo }
  | PinnedResult;

const pinnedCommit = (item: Bookmark, refs: readonly RefInfo[]) =>
  item.kind === 'commit' ? item.name : findRef(refs, item)?.commit;

export function pinnedResults(
  bookmarks: readonly Bookmark[],
  refs: readonly RefInfo[],
): PinnedResult[] {
  return bookmarks.map((bookmark) => ({
    kind: 'pinned' as const,
    bookmark,
    commit: pinnedCommit(bookmark, refs),
  }));
}

export function resultItems(
  commits: readonly CommitInfo[],
  search: readonly SearchGroup[],
  found: StashSearch = noStashes,
  pinned: readonly PinnedResult[] = [],
): ResultItem[] {
  return [
    ...pinned,
    ...search.flatMap((group) =>
      group.refs.map((ref) => ({ kind: 'ref' as const, ref })),
    ),
    ...found.stashes.map((stash) => ({ kind: 'stash' as const, stash })),
    ...commits.map((commit) => ({ kind: 'commit' as const, commit })),
  ];
}

export const commitKey = (hash: string) => `commit:${hash}`;

export const stashKey = (stash: StashInfo) => `stash:${stash.name}`;

export const refKey = (ref: RefInfo) => `${ref.kind}:${ref.name}`;

export const pinnedKey = (item: Bookmark) => `pinned:${item.kind}:${item.name}`;

export const folderKey = (kind: RefKind, path: string) =>
  `folder:${kind}:${path}`;

export function itemKey(item: ResultItem): string {
  return item.kind === 'commit'
    ? commitKey(item.commit.hash)
    : item.kind === 'stash'
      ? stashKey(item.stash)
      : item.kind === 'pinned'
        ? pinnedKey(item.bookmark)
        : refKey(item.ref);
}
