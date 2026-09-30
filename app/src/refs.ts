import type { RefInfo, BookmarkRef } from './shared/protocol';
import { RefType } from './git/refType';
import { hasRef, refOf, withoutRemote } from './shared/refNames';

export interface Head {
  readonly name?: string;
  readonly commit?: string;
  readonly type?: number;
}

export function checkedOutBranch(head: Head | undefined): string | undefined {
  return head?.type === RefType.Tag ? undefined : head?.name;
}

export function fingerprint(
  head: Head | undefined,
  refs: readonly RefInfo[],
): string {
  return [
    `HEAD ${head?.type ?? ''} ${head?.name ?? ''} ${head?.commit ?? ''}`,
    ...refs.map((ref) => `${ref.kind} ${ref.name} ${ref.commit}`).toSorted(),
  ].join('\n');
}

export function countRefs(
  refs: readonly RefInfo[],
  head?: Head,
): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (commit: string) =>
    counts.set(commit, (counts.get(commit) ?? 0) + 1);
  for (const ref of refs) {
    add(ref.commit);
  }
  const detached = detachedHead(head);
  if (detached) {
    add(detached);
  }
  return counts;
}

export function detachedHead(head: Head | undefined): string | undefined {
  return head && !checkedOutBranch(head) ? head.commit : undefined;
}

export function decorations(
  refCounts: ReadonlyMap<string, number>,
  positions: ReadonlyMap<string, number>,
): [number, number][] {
  const result: [number, number][] = [];
  for (const [commit, count] of refCounts) {
    const position = positions.get(commit);
    if (position !== undefined) {
      result.push([position, count]);
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
    ? remoteDefaults.map(withoutRemote)
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
        (ref) => ref.kind === 'remote' && withoutRemote(ref.name) === main,
      )
      .map(refOf),
  ];
  return candidates.filter(exists);
}
