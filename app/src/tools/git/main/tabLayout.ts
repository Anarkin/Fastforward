import { Graph } from './graph';
import {
  mergeExpanded,
  mergesHiding,
  showHistory,
  type IsExpanded,
} from './merges';
import { decorations } from './refs';
import { shownSide } from '../shared/comparisons';
import {
  pageStart,
  workingTreeHash,
  workingTreeIndex,
  type CommitInfo,
  type ScrollTarget,
  type GitToWebviewOf,
} from '../shared/protocol';
import { positionOf, type TabState } from './tabState';

const partialRows = 25;

export function layOutHistory(
  tab: TabState,
  collapse: boolean,
  head: string | undefined,
): number {
  const tips = new Set(tab.heads);
  if (head) {
    tips.add(head);
  }
  const shown = showHistory(
    tab.fullHistory,
    tips,
    toggledAsLaidOut(tab, collapse),
    tab.partial,
  );
  const history = tab.partial ? shown.firstRows(partialRows) : shown;
  tab.history = history;
  tab.positions = history.positions;
  const commits = tab.fullHistory;
  tab.graph = new Graph(history, {
    head:
      head === undefined
        ? undefined
        : (commits.indexOf(head) ?? (tab.partial ? commits.size : undefined)),
    stashes: new Set(
      [...tab.stashes.keys()].flatMap((stash) => commits.indexOf(stash) ?? []),
    ),
    partial: tab.partial,
  });
  tab.shownStale = false;
  tab.index = positionOf(tab, tab.hash);
  return ++tab.generation;
}

export function firstPage(
  tab: TabState,
  keepPlace: boolean,
  scrollTo?: string,
): { start: number; scrollTarget: ScrollTarget | undefined } {
  const scrollTarget =
    (keepPlace ? anchorOf(tab) : undefined) ??
    indexTarget(positionOf(tab, scrollTo) ?? tab.index);
  const index = scrollTarget?.index;
  const start =
    index === undefined || index === workingTreeIndex ? 0 : pageStart(index);
  return { start, scrollTarget };
}

export function commitsMessage(
  tab: TabState,
  page: ReturnType<typeof firstPage>,
  commits: readonly CommitInfo[],
  bookmarked: ReadonlySet<string> = new Set(),
): GitToWebviewOf<'commits'> {
  const { start, scrollTarget } = page;
  return {
    type: 'commits',
    generation: tab.generation,
    total: tab.history.length,
    decorations: decorations(
      new Set([...tab.decorated, ...bookmarked]),
      tab.positions,
    ),
    start,
    commits,
    graph: tab.graph.rows(start, commits.length),
    workingTreeGraph: tab.graph.workingTreeRow,
    selectedIndex: tab.index,
    keysFrom: keysFrom(tab),
    scrollTarget,
  };
}

export function keysFrom(tab: TabState): number | undefined {
  const hash = shownSide(tab.hash);
  if (
    tab.index !== undefined ||
    hash === undefined ||
    !tab.fullHistory.has(hash)
  ) {
    return undefined;
  }
  return mergesHidingCommit(tab, hash)
    .map((merge) => tab.positions.get(merge))
    .find((index) => index !== undefined);
}

export function toggleMerges(tab: TabState, merges: readonly string[]): void {
  for (const merge of merges) {
    if (!tab.toggledMerges.delete(merge)) {
      tab.toggledMerges.add(merge);
    }
  }
}

export function expandMerges(
  tab: TabState,
  merges: readonly string[],
  collapse: boolean,
): void {
  const expanded = isExpanded(tab, collapse);
  for (const merge of merges) {
    if (!mergeExpanded(tab.fullHistory, merge, expanded)) {
      toggleMerges(tab, [merge]);
    }
  }
}

function isExpanded(tab: TabState, collapse: boolean): IsExpanded {
  return (at, isPull) =>
    (collapse && !isPull) === tab.toggledMerges.has(tab.fullHistory.hashAt(at));
}

function toggledAsLaidOut(tab: TabState, collapse: boolean): IsExpanded {
  const toggled = new Set<number>();
  for (const merge of tab.toggledMerges) {
    const at = tab.fullHistory.indexOf(merge);
    if (at !== undefined) {
      toggled.add(at);
    }
  }
  return (at, isPull) => (collapse && !isPull) === toggled.has(at);
}

export function mergesHidingCommit(tab: TabState, hash: string): string[] {
  return mergesHiding(tab.fullHistory, tab.positions, hash);
}

export function anchorOf(tab: TabState): ScrollTarget | undefined {
  if (!tab.anchor) {
    return undefined;
  }
  const { hash, offset, report } = tab.anchor;
  if (hash === workingTreeHash) {
    return { index: workingTreeIndex, offset, report };
  }
  const index = tab.positions.get(hash);
  return index === undefined ? undefined : { index, offset, report };
}

export function indexTarget(
  index: number | undefined,
): ScrollTarget | undefined {
  return index === undefined ? undefined : { index };
}
