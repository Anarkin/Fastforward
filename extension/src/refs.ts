import type { RefInfo, VipRef } from './protocol';

interface Head {
  readonly name?: string;
  readonly commit?: string;
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

// How many refs point at each commit
export function countRefs(refs: readonly RefInfo[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const ref of refs) {
    counts.set(ref.commit, (counts.get(ref.commit) ?? 0) + 1);
  }
  return counts;
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

// origin/main is main
function withoutRemote(name: string): string {
  return name.slice(name.indexOf('/') + 1);
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
