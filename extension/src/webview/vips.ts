import type { RefInfo, VipRef } from '../protocol';

// A-Z, with a remote branch next to the local one of the same name: origin/main
// sorts as main, after main itself, and a tag of the same name after both
const kindOrder: Record<VipRef['kind'], number> = {
  branch: 0,
  remote: 1,
  tag: 2,
};

function withoutRemote(name: string): string {
  return name.slice(name.indexOf('/') + 1);
}

function sortName(vip: VipRef): string {
  return vip.kind === 'remote' ? withoutRemote(vip.name) : vip.name;
}

export function compareVips(a: VipRef, b: VipRef): number {
  const options = { sensitivity: 'base' } as const;
  return (
    sortName(a).localeCompare(sortName(b), undefined, options) ||
    kindOrder[a.kind] - kindOrder[b.kind] ||
    a.name.localeCompare(b.name, undefined, options)
  );
}

// The VIPs as shown: the saved ones, plus the checked-out branch and its remote
// while it is checked out, which aren't saved; the remote is the branch it
// tracks, or else a remote branch of the same name
export function shownVips(
  vips: readonly VipRef[],
  refs: readonly RefInfo[],
  head: string | undefined,
  headUpstream: string | undefined,
): VipRef[] {
  const shown = [...vips];
  const add = (vip: VipRef) => {
    const exists = refs.some(
      (ref) => ref.kind === vip.kind && ref.name === vip.name,
    );
    const listed = shown.some(
      (other) => other.kind === vip.kind && other.name === vip.name,
    );
    if (exists && !listed) {
      shown.push(vip);
    }
  };
  if (head) {
    add({ kind: 'branch', name: head });
    if (headUpstream) {
      add({ kind: 'remote', name: headUpstream });
    } else {
      for (const ref of refs) {
        if (ref.kind === 'remote' && withoutRemote(ref.name) === head) {
          add({ kind: 'remote', name: ref.name });
        }
      }
    }
  }
  return shown.toSorted(compareVips);
}
