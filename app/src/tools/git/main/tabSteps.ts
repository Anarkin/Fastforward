import { reachable } from './navigation';
import { sidesOf } from '../shared/comparisons';
import {
  workingTreeHash,
  type CommitInfo,
  type NavigationEntry,
} from '../shared/protocol';
import { strings } from '../../../lib/shared/strings';
import { stillThere, type TabState } from './tabState';

const navigationShown = 20;
const subjectsKept = 1000;

export function nearestSteps(
  tab: TabState,
  current = tab.hash,
): {
  back: string[];
  forward: string[];
} {
  const exists = stillThere(tab);
  const nearest = (steps: readonly string[]) =>
    reachable(steps, current, exists).toReversed().slice(0, navigationShown);
  return {
    back: nearest(tab.navigation.back),
    forward: nearest(tab.navigation.forward),
  };
}

export function navigationEntry(tab: TabState, hash: string): NavigationEntry {
  return {
    hash,
    subject:
      hash === workingTreeHash
        ? strings.commits.uncommitted
        : tab.subjects.get(hash),
  };
}

export function keepSubjects(
  tab: TabState,
  commits: readonly CommitInfo[],
): void {
  if (tab.subjects.size + commits.length > subjectsKept) {
    const { back, forward } = tab.navigation;
    const needed = new Set(
      [...back, ...forward, tab.hash].flatMap((hash) => sidesOf(hash)),
    );
    for (const hash of tab.subjects.keys()) {
      if (!needed.has(hash)) {
        tab.subjects.delete(hash);
      }
    }
  }
  for (const commit of commits) {
    tab.subjects.set(commit.hash, commit.subject);
  }
}
