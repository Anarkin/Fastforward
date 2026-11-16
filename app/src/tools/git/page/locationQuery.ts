import { isHashPrefix } from '../../../lib/shared/hashes';
import type { CommitInfo, CommitResults } from '../shared/protocol';
import { ResultItem } from './locationResults';

export function foundCommits(
  byHash: readonly CommitInfo[],
  byText: readonly CommitInfo[],
): CommitInfo[] {
  const hashes = new Set(byHash.map((commit) => commit.hash));
  return [...byHash, ...byText.filter((commit) => !hashes.has(commit.hash))];
}

export function hashQuery(query: string): string | undefined {
  const trimmed = query.trim().toLowerCase();
  return isHashPrefix(trimmed) ? trimmed : undefined;
}

const minSearchLength = 3;

export function textQuery(query: string): string | undefined {
  const trimmed = query.trim();
  return trimmed.length >= minSearchLength ? trimmed : undefined;
}

export function enterTarget(
  query: string,
  found: CommitResults | undefined,
  active: ResultItem | undefined,
  picked = false,
): string | undefined {
  const hash = hashQuery(query);
  const named = active !== undefined && resultName(active) === query.trim();
  if (hash && found === undefined && !((picked || named) && active)) {
    return hash;
  }
  if (!query.trim() || !active) {
    return undefined;
  }
  return resultCommit(active);
}

function resultName(item: ResultItem): string | undefined {
  return item.kind === 'ref'
    ? item.ref.name
    : item.kind === 'pinned'
      ? item.bookmark.name
      : undefined;
}

function resultCommit(item: ResultItem): string | undefined {
  return item.kind === 'commit'
    ? item.commit.hash
    : item.kind === 'stash'
      ? item.stash.commit
      : item.kind === 'pinned'
        ? item.commit
        : item.ref.commit;
}
