import type { Head } from './cli/repository';
import type { Positions } from './history/merges';
import type { RefInfo, BookmarkRef, StashInfo } from '../shared/protocol';
import {
  hasRef,
  localBranchOf,
  refOf,
  withoutRemote,
} from '../shared/refNames';

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

export function defaultBookmarks(
  refs: readonly RefInfo[],
  remoteDefaults: readonly string[],
): BookmarkRef[] {
  const exists = (bookmark: BookmarkRef) => hasRef(refs, bookmark);
  const [main] = remoteDefaults.length
    ? remoteDefaults.map((name) => localBranchOf(refs, name))
    : ['main', 'master', 'trunk'].filter((name) =>
        exists({ kind: 'branch', name }),
      );
  if (main === undefined) {
    return [];
  }
  const candidates: BookmarkRef[] = [
    { kind: 'branch', name: main },
    ...refs
      .filter(
        (ref) =>
          ref.kind === 'remote' && withoutRemote(ref.name, ref.remote) === main,
      )
      .map(refOf),
  ];
  return candidates.filter(exists);
}

export function remoteTagRefs(
  lists: ReadonlyMap<string, ReadonlyMap<string, string>>,
  remotes: readonly string[],
): RefInfo[] {
  return remotes.flatMap((remote) =>
    [...(lists.get(remote) ?? [])].map(([tag, commit]): RefInfo => ({
      kind: 'remote-tag',
      name: `${remote}/${tag}`,
      commit,
      remote,
    })),
  );
}

export function sameTags(
  a: ReadonlyMap<string, string> | undefined,
  b: ReadonlyMap<string, string>,
): boolean {
  return (
    a !== undefined &&
    a.size === b.size &&
    [...b].every(([tag, commit]) => a.get(tag) === commit)
  );
}
