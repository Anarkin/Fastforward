import type { Positions } from './history/merges';
import type { RefInfo, BookmarkRef } from './shared/protocol';
import { hasRef, localBranchOf, refOf, withoutRemote } from './shared/refNames';

export interface Head {
  readonly name?: string;
  readonly commit?: string;
}

export function fingerprint(
  head: Head | undefined,
  refs: readonly RefInfo[],
): string {
  return [
    `HEAD ${head?.name ?? ''} ${head?.commit ?? ''}`,
    ...refs.map((ref) => `${ref.kind} ${ref.name} ${ref.commit}`).toSorted(),
  ].join('\n');
}

export function decoratedCommits(
  refs: readonly RefInfo[],
  head?: Head,
): Set<string> {
  const decorated = new Set(refs.map((ref) => ref.commit));
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
