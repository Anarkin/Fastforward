import type { CheckoutTarget, RefInfo, BookmarkRef } from '../protocol';
import { withoutRemote } from '../refNames';

export interface CheckoutOption {
  readonly label: string;
  readonly target: CheckoutTarget;
  // What is checked out already
  readonly disabled: boolean;
}

const byName = (a: RefInfo, b: RefInfo) => a.name.localeCompare(b.name);

// Checking out a ref: a branch switches to it, a remote branch to the local
// branch of the same name, which is created to track it when there is none,
// and a tag detaches HEAD; labels are just the names, and what is checked
// out is greyed out
export function checkoutRef(
  ref: BookmarkRef,
  refs: readonly RefInfo[],
  head: string | undefined,
): CheckoutOption {
  const target = { kind: ref.kind, name: ref.name };
  if (ref.kind === 'branch') {
    const checkedOut = ref.name === head;
    return {
      label: ref.name,
      target,
      disabled: checkedOut,
    };
  }
  if (ref.kind === 'tag') {
    return { label: ref.name, target, disabled: false };
  }
  const local = withoutRemote(ref.name);
  const localRef = refs.find(
    (other) => other.kind === 'branch' && other.name === local,
  );
  const remoteRef = refs.find(
    (other) => other.kind === 'remote' && other.name === ref.name,
  );
  const same = localRef?.commit === remoteRef?.commit;
  return {
    label: ref.name,
    target,
    // Only when it would change nothing
    disabled: local === head && same,
  };
}

// Everything that can be checked out at a commit: its local branches, its
// remote branches, its tags, then the commit itself
export function checkoutOptions(
  hash: string,
  refs: readonly RefInfo[],
  head: string | undefined,
  detachedHead: string | undefined,
): CheckoutOption[] {
  const here = refs.filter((ref) => ref.commit === hash);
  const kind = (k: RefInfo['kind']) =>
    here.filter((ref) => ref.kind === k).toSorted(byName);
  const checkedOut = detachedHead === hash;
  return [
    ...kind('branch').map((ref) => checkoutRef(ref, refs, head)),
    ...kind('remote').map((ref) => checkoutRef(ref, refs, head)),
    ...kind('tag').map((ref) => checkoutRef(ref, refs, head)),
    {
      label: hash.slice(0, 7),
      target: { kind: 'commit', hash },
      disabled: checkedOut,
    },
  ];
}
