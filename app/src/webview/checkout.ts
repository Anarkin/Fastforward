import { shortHash } from '../shared/hashes';
import type { CheckoutTarget, RefInfo, BookmarkRef } from '../shared/protocol';
import { findRef, hasRef, localBranchOf, refOf } from '../shared/refNames';
import { byName } from './byName';

export interface CheckoutOption {
  readonly label: string;
  readonly target: CheckoutTarget;
  readonly disabled: boolean;
}

export function checkoutRef(
  ref: BookmarkRef,
  refs: readonly RefInfo[],
  head: string | undefined,
): CheckoutOption {
  const target = refOf(ref);
  return { label: ref.name, target, disabled: cannotCheckOut(ref, refs, head) };
}

function cannotCheckOut(
  ref: BookmarkRef,
  refs: readonly RefInfo[],
  head: string | undefined,
): boolean {
  if (!hasRef(refs, ref)) {
    return true;
  }
  if (ref.kind === 'branch') {
    return ref.name === head;
  }
  if (ref.kind === 'tag') {
    return false;
  }
  const local = localBranchOf(refs, ref.name);
  const localRef = findRef(refs, { kind: 'branch', name: local });
  return local === head && localRef?.commit === findRef(refs, ref)?.commit;
}

export function checkoutCommit(
  hash: string,
  detachedHead: string | undefined,
): CheckoutOption {
  return {
    label: shortHash(hash),
    target: { kind: 'commit', hash },
    disabled: detachedHead === hash,
  };
}

export function checkoutOptions(
  hash: string,
  refs: readonly RefInfo[],
  head: string | undefined,
  detachedHead: string | undefined,
): CheckoutOption[] {
  const here = refs.filter((ref) => ref.commit === hash);
  return [
    ...(['branch', 'remote', 'tag'] as const).flatMap((kind) =>
      here
        .filter((ref) => ref.kind === kind)
        .toSorted(byName)
        .map((ref) => checkoutRef(ref, refs, head)),
    ),
    checkoutCommit(hash, detachedHead),
  ];
}
