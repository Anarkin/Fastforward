import type { Head } from './refReads';
import type { Stash } from './stashes';
import type { Commits } from './commits';
import { keepsTiedOrder, ranksOf } from './extend';
import { headsOf } from './heads';
import { decoratedCommits, fingerprint } from './refs';
import type { RefInfo } from '../shared/protocol';
import type { TabState } from './tabState';

export function loadHistory(
  tab: TabState,
  fullHistory: Commits,
  head: Head | undefined,
  refs: readonly RefInfo[],
  stashes: readonly Stash[] = [],
  dates: ReadonlyMap<string, number> = new Map(),
  partial = false,
): void {
  tab.fullHistory = fullHistory;
  tab.partial = partial;
  tab.heads = headsOf(fullHistory);
  takeRefs(tab, head, refs, stashes, dates);
  if (partial) {
    forgetHistory(tab);
  }
}

export function takeRefs(
  tab: TabState,
  head: Head | undefined,
  refs: readonly RefInfo[],
  stashes: readonly Stash[] = [],
  dates: ReadonlyMap<string, number> = new Map(),
): void {
  tab.headCommit = head?.commit;
  tab.stashes = new Map(stashes.map((stash) => [stash.commit, stash]));
  tab.ranks = ranksOf(tipsInGitOrder(head, refs, false, stashes, dates));
  tab.fingerprint = fingerprint(head, refs, stashes);
  tab.decorated = decoratedCommits(refs, head, stashes);
}

export function refsKeepHistory(
  tab: TabState,
  head: Head | undefined,
  refs: readonly RefInfo[],
  solo: boolean,
  stashes: readonly Stash[] = [],
  dates: ReadonlyMap<string, number> = new Map(),
): boolean {
  const tips = tipsInGitOrder(head, refs, solo, stashes, dates);
  const ranks = ranksOf(tips);
  return (
    historyLoaded(tab) &&
    stashesKeepHistory(tab, stashes, solo) &&
    [...tips].every((tip) => tab.fullHistory.has(tip)) &&
    [...tab.heads].every((commit) => tips.has(commit)) &&
    keepsTiedOrder(
      tab.heads,
      (commit) => dates.get(commit),
      (commit) => tab.ranks.get(commit),
      (commit) => ranks.get(commit),
    )
  );
}

export function stashesKeepHistory(
  tab: TabState,
  stashes: readonly Stash[],
  solo: boolean,
): boolean {
  const now = new Set(stashes.map((stash) => stash.commit));
  return (
    solo ||
    [...tab.stashes.keys(), ...now].every(
      (commit) =>
        tab.stashes.has(commit) === now.has(commit) ||
        !tab.fullHistory.has(commit),
    )
  );
}

export function tipsInGitOrder(
  head: Head | undefined,
  refs: readonly RefInfo[],
  solo: boolean,
  stashes: readonly Stash[] = [],
  dates: ReadonlyMap<string, number> = new Map(),
): Set<string> {
  const tips = new Set<string>();
  if (head?.commit) {
    tips.add(head.commit);
  }
  if (!solo) {
    for (const tip of [
      ...dates.keys(),
      ...[...refs.filter((ref) => ref.kind !== 'remote-tag'), ...stashes].map(
        (ref) => ref.commit,
      ),
    ]) {
      tips.add(tip);
    }
  }
  return tips;
}

export function historyLoaded(tab: TabState): boolean {
  return tab.fingerprint !== '';
}

export function forgetHistory(tab: TabState): void {
  tab.fingerprint = '';
}
