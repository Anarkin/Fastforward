import { stepMatch, type MatchesFound } from '../../../lib/shared/textMatches';
import type { CommitInfo, CrowdedCommit } from '../shared/protocol';
import { bubblesOn, type CommitSurroundings } from './bubbleLooks';
import { CommitHistory } from './commitHistory';

export const filterLimit = 1000;

export function filteredHistory(
  found: readonly CommitInfo[],
  around: Pick<
    CommitSurroundings,
    'refsByCommit' | 'stashCommits' | 'bookmarked' | 'detached'
  >,
): CommitHistory {
  const decorated: number[] = [];
  const crowded: CrowdedCommit[] = [];
  found.forEach((commit, position) => {
    const bubbles = bubblesOn(commit.hash, around).length;
    if (bubbles > 0) {
      decorated.push(position);
    }
    if (bubbles > 1) {
      crowded.push({ position, hash: commit.hash, lanes: 0 });
    }
  });
  const history = new CommitHistory(
    found.length,
    decorated,
    undefined,
    0,
    undefined,
    undefined,
    crowded,
  );
  history.add(0, found);
  return history;
}

export function foundCount(
  found: readonly CommitInfo[] | undefined,
  selected: string | undefined,
  capped: boolean,
): MatchesFound {
  return found === undefined
    ? { current: -1, matches: 0, searching: true }
    : {
        current: found.findIndex((commit) => commit.hash === selected),
        matches: found.length,
        capped,
      };
}

export function steppedCommit(
  found: readonly CommitInfo[],
  selected: string | undefined,
  step: 1 | -1,
): string | undefined {
  const at = found.findIndex((commit) => commit.hash === selected);
  return found.at(
    at === -1
      ? step === 1
        ? 0
        : found.length - 1
      : stepMatch(at, found.length, step),
  )?.hash;
}
