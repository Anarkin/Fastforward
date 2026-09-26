import type { VipRef } from '../protocol';

// A-Z, with a remote branch next to the local one of the same name: origin/main
// sorts as main, after main itself, and a tag of the same name after both
const kindOrder: Record<VipRef['kind'], number> = {
  branch: 0,
  remote: 1,
  tag: 2,
};

function sortName(vip: VipRef): string {
  return vip.kind === 'remote'
    ? vip.name.slice(vip.name.indexOf('/') + 1)
    : vip.name;
}

export function compareVips(a: VipRef, b: VipRef): number {
  const options = { sensitivity: 'base' } as const;
  return (
    sortName(a).localeCompare(sortName(b), undefined, options) ||
    kindOrder[a.kind] - kindOrder[b.kind] ||
    a.name.localeCompare(b.name, undefined, options)
  );
}
