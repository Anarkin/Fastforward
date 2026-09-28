import type { RefInfo, VipRef } from './protocol';
import { withoutRemote } from './refNames';

interface Head {
  readonly name?: string;
  readonly commit?: string;
  readonly type?: number;
}

// RefType.Tag, which is a const enum in the Git extension's declaration file,
// so its value is repeated here
const refTypeTag = 2;

// The branch HEAD is on; a HEAD detached at a tag is named after the tag by
// the Git extension, but no branch is checked out then
export function checkedOutBranch(head: Head | undefined): string | undefined {
  return head?.type === refTypeTag ? undefined : head?.name;
}

// HEAD and where every ref points, to tell whether the history changed; the
// order of the refs doesn't matter
export function fingerprint(
  head: Head | undefined,
  refs: readonly RefInfo[],
): string {
  return [
    `HEAD ${head?.name ?? ''} ${head?.commit ?? ''}`,
    ...refs.map((ref) => `${ref.kind} ${ref.name} ${ref.commit}`).toSorted(),
  ].join('\n');
}

// How many bubbles each commit has: its refs, and a detached HEAD, which is
// shown as a bubble of its own
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

// The commit HEAD points at when no branch is checked out, as after checking
// out a commit, a tag or a remote branch, or during a rebase
export function detachedHead(head: Head | undefined): string | undefined {
  return head && !checkedOutBranch(head) ? head.commit : undefined;
}

// [position, number of refs] for every shown commit that refs point at, which
// the list sizes its rows from
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

// The VIPs a repository starts with: its main branch, the remote's default
// like origin/main, or else a local main, master or trunk, as the local branch
// and every remote branch of the same name that exist
export function defaultVips(
  refs: readonly RefInfo[],
  remoteDefaults: readonly string[],
): VipRef[] {
  const exists = (vip: VipRef) =>
    refs.some((ref) => ref.kind === vip.kind && ref.name === vip.name);
  const [main] = remoteDefaults.length
    ? remoteDefaults.map(withoutRemote)
    : ['main', 'master', 'trunk'].filter((name) =>
        exists({ kind: 'branch', name }),
      );
  if (main === undefined) {
    return [];
  }
  const candidates: VipRef[] = [
    { kind: 'branch', name: main },
    ...refs
      .filter(
        (ref) => ref.kind === 'remote' && withoutRemote(ref.name) === main,
      )
      .map((ref) => ({ kind: ref.kind, name: ref.name })),
  ];
  return candidates.filter(exists);
}
