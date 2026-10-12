import type { RefInfo } from '../shared/protocol';
import { withoutRemote } from '../shared/refNames';

export function tagsOnRemote(
  refs: readonly RefInfo[],
  remote: string,
): Set<string> {
  return new Set(
    refs
      .filter((ref) => ref.kind === 'remote-tag' && ref.remote === remote)
      .map((ref) => withoutRemote(ref.name, remote)),
  );
}
