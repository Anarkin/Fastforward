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

// The bubbles row: the checked-out branch and the branch it tracks as a pair
// on the left, with pull and push between them, then the other VIPs, sorted;
// the pair shows whether or not its refs are VIPs, and only once
export interface BubbleRow {
  readonly branch: VipRef | undefined;
  readonly upstream: VipRef | undefined;
  readonly others: VipRef[];
}

export function bubbleRow(
  vips: readonly VipRef[],
  refs: readonly RefInfo[],
  head: string | undefined,
  headUpstream: string | undefined,
): BubbleRow {
  const exists = (vip: VipRef) =>
    refs.some((ref) => ref.kind === vip.kind && ref.name === vip.name);
  const branch: VipRef | undefined = head
    ? { kind: 'branch', name: head }
    : undefined;
  const upstream: VipRef | undefined =
    branch && headUpstream ? { kind: 'remote', name: headUpstream } : undefined;
  const pair = [branch, upstream].filter(
    (vip): vip is VipRef => vip !== undefined && exists(vip),
  );
  return {
    branch: branch && exists(branch) ? branch : undefined,
    upstream: upstream && exists(upstream) ? upstream : undefined,
    others: vips
      .filter(
        (vip) =>
          !pair.some(
            (other) => other.kind === vip.kind && other.name === vip.name,
          ),
      )
      .toSorted(compareVips),
  };
}
