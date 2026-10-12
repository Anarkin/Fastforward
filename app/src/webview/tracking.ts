import type { RefInfo, Tracking } from '../shared/protocol';

export function trackingOf(
  refs: readonly RefInfo[],
  branch: string | undefined,
): Tracking | undefined {
  return refs.find((ref) => ref.kind === 'branch' && ref.name === branch)
    ?.tracking;
}
