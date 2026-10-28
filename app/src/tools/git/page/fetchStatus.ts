import type { LastFetch } from '../shared/protocol';

export type FetchStatus = 'unknown' | 'fresh' | 'stale' | 'failed';

const roundsMissed = 2;

export function fetchStatus(
  { succeeded, failed }: LastFetch,
  autoFetchMinutes: number,
  now: number,
): FetchStatus {
  if (failed !== undefined && (succeeded === undefined || failed > succeeded)) {
    return 'failed';
  }
  if (succeeded === undefined) {
    return 'unknown';
  }
  return autoFetchMinutes > 0 &&
    now - succeeded > roundsMissed * autoFetchMinutes * 60_000
    ? 'stale'
    : 'fresh';
}
