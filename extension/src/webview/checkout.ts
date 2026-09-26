import type { CheckoutTarget, RefInfo, VipRef } from '../protocol';

export interface CheckoutOption {
  readonly label: string;
  readonly target: CheckoutTarget;
  // What is checked out already
  readonly disabled: boolean;
}

function withoutRemote(name: string): string {
  return name.slice(name.indexOf('/') + 1);
}

const byName = (a: RefInfo, b: RefInfo) => a.name.localeCompare(b.name);

// Checking out a ref: a branch switches to it, a remote branch to the local
// branch of the same name, which is created to track it when there is none,
// and a tag detaches HEAD; labels say where each one leads
export function checkoutRef(
  ref: VipRef,
  refs: readonly RefInfo[],
  head: string | undefined,
): CheckoutOption {
  const target = { kind: ref.kind, name: ref.name };
  if (ref.kind === 'branch') {
    const checkedOut = ref.name === head;
    return {
      label: checkedOut ? `${ref.name} (checked out)` : ref.name,
      target,
      disabled: checkedOut,
    };
  }
  if (ref.kind === 'tag') {
    return { label: `${ref.name} (detached HEAD)`, target, disabled: false };
  }
  const local = withoutRemote(ref.name);
  const exists = refs.some(
    (other) => other.kind === 'branch' && other.name === local,
  );
  return {
    label: exists
      ? `${ref.name} (switches to ${local})`
      : `${ref.name} (new branch ${local})`,
    target,
    disabled: local === head,
  };
}

// Everything that can be checked out at a commit: its local branches, its
// remote branches without a local branch here, its tags, then the commit
// itself
export function checkoutOptions(
  hash: string,
  refs: readonly RefInfo[],
  head: string | undefined,
  detachedHead: string | undefined,
): CheckoutOption[] {
  const here = refs.filter((ref) => ref.commit === hash);
  const kind = (k: RefInfo['kind']) =>
    here.filter((ref) => ref.kind === k).toSorted(byName);
  const localHere = new Set(kind('branch').map((ref) => ref.name));
  const checkedOut = detachedHead === hash;
  return [
    ...kind('branch').map((ref) => checkoutRef(ref, refs, head)),
    // A local branch at this commit already stands for its remote
    ...kind('remote')
      .filter((ref) => !localHere.has(withoutRemote(ref.name)))
      .map((ref) => checkoutRef(ref, refs, head)),
    ...kind('tag').map((ref) => checkoutRef(ref, refs, head)),
    {
      label: `Commit ${hash.slice(0, 7)} (${checkedOut ? 'checked out' : 'detached HEAD'})`,
      target: { kind: 'commit', hash },
      disabled: checkedOut,
    },
  ];
}
