import type { RefInfo, BookmarkRef } from '../shared/protocol';
import {
  hasRef,
  localBranchOf,
  refOf,
  withoutRemote,
} from '../shared/refNames';

export function defaultBookmarks(
  refs: readonly RefInfo[],
  remoteDefaults: readonly string[],
): BookmarkRef[] {
  const exists = (bookmark: BookmarkRef) => hasRef(refs, bookmark);
  const [main] = remoteDefaults.length
    ? remoteDefaults.map((name) => localBranchOf(refs, name))
    : ['main', 'master', 'trunk'].filter((name) =>
        exists({ kind: 'branch', name }),
      );
  if (main === undefined) {
    return [];
  }
  const candidates: BookmarkRef[] = [
    { kind: 'branch', name: main },
    ...refs
      .filter(
        (ref) =>
          ref.kind === 'remote' && withoutRemote(ref.name, ref.remote) === main,
      )
      .map(refOf),
  ];
  return candidates.filter(exists);
}
