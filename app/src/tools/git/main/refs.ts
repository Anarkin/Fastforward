import type { Head } from './refReads';
import type { Positions } from './merges';
import type { CrowdedCommit, RefInfo, StashInfo } from '../shared/protocol';

export function fingerprint(
  head: Head | undefined,
  refs: readonly RefInfo[],
  stashes: readonly StashInfo[] = [],
): string {
  return [
    `HEAD ${head?.name ?? ''} ${head?.commit ?? ''}`,
    ...refs
      .map(
        (ref) =>
          `${ref.kind} ${ref.name} ${ref.commit}${trackingKey(ref.tracking)}`,
      )
      .toSorted(),
    ...stashes.map((stash) => `stash ${stash.name} ${stash.commit}`),
  ].join('\n');
}

function trackingKey(tracking: RefInfo['tracking']): string {
  if (tracking === undefined) {
    return '';
  }
  return 'gone' in tracking
    ? ` ${tracking.upstream} gone`
    : ` ${tracking.upstream}`;
}

export function bubblesOnCommits(
  refs: readonly RefInfo[],
  head?: Head,
  stashes: readonly StashInfo[] = [],
): Map<string, number> {
  const bubbles = new Map<string, number>();
  const detached = detachedHead(head);
  for (const commit of [
    ...[...refs, ...stashes].map((ref) => ref.commit),
    ...(detached ? [detached] : []),
  ]) {
    bubbles.set(commit, (bubbles.get(commit) ?? 0) + 1);
  }
  return bubbles;
}

export function detachedHead(head: Head | undefined): string | undefined {
  return head && !head.name ? head.commit : undefined;
}

export function decorations(
  decorated: Iterable<string>,
  positions: Pick<Positions, 'get'>,
): number[] {
  const result: number[] = [];
  for (const commit of decorated) {
    const position = positions.get(commit);
    if (position !== undefined) {
      result.push(position);
    }
  }
  return result;
}

export function crowdedCommits(
  bubbles: ReadonlyMap<string, number>,
  bookmarked: ReadonlySet<string>,
  positions: Pick<Positions, 'get'>,
  lanesAt: (position: number) => number | undefined,
): CrowdedCommit[] {
  const crowded: CrowdedCommit[] = [];
  for (const [hash, count] of bubbles) {
    const position = positions.get(hash);
    if (position !== undefined && count + (bookmarked.has(hash) ? 1 : 0) > 1) {
      crowded.push({ position, hash, lanes: lanesAt(position) ?? 0 });
    }
  }
  return crowded;
}
