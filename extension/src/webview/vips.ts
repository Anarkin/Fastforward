import type { RefInfo, Vip, VipRef } from '../protocol';

// A-Z, with a remote branch next to the local one of the same name: origin/main
// sorts as main, after main itself, and a tag of the same name after both;
// commits come after every ref, in the order they were added
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

export function compareVips(a: Vip, b: Vip): number {
  if (a.kind === 'commit' || b.kind === 'commit') {
    return Number(a.kind === 'commit') - Number(b.kind === 'commit');
  }
  const options = { sensitivity: 'base' } as const;
  return (
    sortName(a).localeCompare(sortName(b), undefined, options) ||
    kindOrder[a.kind] - kindOrder[b.kind] ||
    a.name.localeCompare(b.name, undefined, options)
  );
}

// What of a commit can be a VIP: its refs, in the order of the VIP row, then
// the commit itself
export interface VipOption {
  readonly label: string;
  readonly vip: Vip;
}

export function vipOptions(
  hash: string,
  refs: readonly RefInfo[],
): VipOption[] {
  return [
    ...refs
      .filter((ref) => ref.commit === hash)
      .map((ref): Vip => ({ kind: ref.kind, name: ref.name }))
      .toSorted(compareVips)
      .map((vip) => ({ label: vip.name, vip })),
    {
      label: `Commit ${hash.slice(0, 7)}`,
      vip: { kind: 'commit', name: hash },
    },
  ];
}

// The bubbles row: the VIPs, sorted, and the checked-out branch and the
// branch it tracks as a pair, with pull and push between them; a checked-out
// VIP stays in its place, as a pair or as the detached HEAD's bubble, so the
// row doesn't shift when checking out, and anything else checked out follows
// the VIPs, set apart, as it is only there while checked out
export interface BubbleRow {
  readonly branch: VipRef | undefined;
  readonly upstream: VipRef | undefined;
  // Including a checked-out VIP, whose place the pair or HEAD bubble takes;
  // the upstream is left out, as it shows in the pair
  readonly vips: Vip[];
  readonly checkedOutIsVip: boolean;
}

const same = (a: Vip, b: Vip) => a.kind === b.kind && a.name === b.name;

export function bubbleRow(
  vips: readonly Vip[],
  refs: readonly RefInfo[],
  head: string | undefined,
  headUpstream: string | undefined,
  detached?: string,
): BubbleRow {
  const exists = (vip: VipRef) =>
    refs.some((ref) => ref.kind === vip.kind && ref.name === vip.name);
  const isVip = (vip: Vip) => vips.some((other) => same(other, vip));
  const branch: VipRef | undefined =
    head && exists({ kind: 'branch', name: head })
      ? { kind: 'branch', name: head }
      : undefined;
  const upstream: VipRef | undefined =
    branch && headUpstream && exists({ kind: 'remote', name: headUpstream })
      ? { kind: 'remote', name: headUpstream }
      : undefined;
  return {
    branch,
    upstream,
    vips: vips
      .filter((vip) => !(upstream && same(vip, upstream)))
      .toSorted(compareVips),
    checkedOutIsVip: detached
      ? isVip({ kind: 'commit', name: detached })
      : branch !== undefined && isVip(branch),
  };
}
