import type { Head } from './repository';
import type { Positions } from './merges';
import type { RefInfo, StashInfo } from '../shared/protocol';

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

export function decoratedCommits(
  refs: readonly RefInfo[],
  head?: Head,
  stashes: readonly StashInfo[] = [],
): Set<string> {
  const decorated = new Set([...refs, ...stashes].map((ref) => ref.commit));
  const detached = detachedHead(head);
  if (detached) {
    decorated.add(detached);
  }
  return decorated;
}

export function detachedHead(head: Head | undefined): string | undefined {
  return head && !head.name ? head.commit : undefined;
}

export function decorations(
  decorated: ReadonlySet<string>,
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
