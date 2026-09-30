import { shortHash } from '../shared/hashes';
import type { CheckoutTarget, RefInfo, BookmarkRef } from '../shared/protocol';
import { hasRef, withoutRemote } from '../shared/refNames';

export interface CheckoutOption {
  readonly label: string;
  readonly target: CheckoutTarget;
  readonly disabled: boolean;
}

const byName = (a: RefInfo, b: RefInfo) => a.name.localeCompare(b.name);

export function checkoutRef(
  ref: BookmarkRef,
  refs: readonly RefInfo[],
  head: string | undefined,
): CheckoutOption {
  const target = { kind: ref.kind, name: ref.name };
  if (!hasRef(refs, ref)) {
    return { label: ref.name, target, disabled: true };
  }
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
    disabled: local === head && same,
  };
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
  const kind = (k: RefInfo['kind']) =>
    here.filter((ref) => ref.kind === k).toSorted(byName);
  return [
    ...kind('branch').map((ref) => checkoutRef(ref, refs, head)),
    ...kind('remote').map((ref) => checkoutRef(ref, refs, head)),
    ...kind('tag').map((ref) => checkoutRef(ref, refs, head)),
    checkoutCommit(hash, detachedHead),
  ];
}
