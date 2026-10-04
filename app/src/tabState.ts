import type { HistoryEntry } from './git/history';
import type { WorkingTree } from './git/workingTree';
import { Graph } from './history/graph';
import {
  headsOf,
  mergeExpanded,
  mergesHiding,
  positionsOf,
  showHistory,
  type Positions,
  type ShownEntry,
} from './history/merges';
import { noNavigation, reachable, type Navigation } from './history/navigation';
import { countRefs, decorations, fingerprint, type Head } from './refs';
import { comparedOf, sidesOf } from './shared/comparisons';
import {
  pageStart,
  workingTreeHash,
  workingTreeIndex,
  workingTreeSubject,
  type CommitInfo,
  type FileChange,
  type NavigationEntry,
  type RefInfo,
  type ScrollTarget,
  type ToWebview,
  type ToWebviewOf,
} from './shared/protocol';

export interface TabState {
  hash: string | undefined;
  index: number | undefined;
  path: string | undefined;
  entireFile: boolean;
  diffStale: boolean;
  changedFiles: Map<string, FileChange>;
  workingTree: WorkingTree | undefined;
  fullHistory: readonly HistoryEntry[];
  inHistory: Set<string>;
  subjects: Map<string, string>;
  heads: Set<string>;
  headCommit: string | undefined;
  fingerprint: string;
  anchor: { hash: string; offset: number } | undefined;
  opened: boolean;
  navigation: Navigation;
  refCounts: Map<string, number>;
  toggledMerges: Set<string>;
  history: readonly ShownEntry[];
  positions: Positions;
  generation: number;
  graph: Graph;
  shownStale: boolean;
  shown: Shown;
}

interface Shown {
  repository?: ToWebviewOf<'repository'>;
  fetching?: ToWebviewOf<'fetching'>;
  applyingSolo?: ToWebviewOf<'applyingSolo'>;
  navigation?: ToWebviewOf<'navigation'>;
  commits?: ToWebviewOf<'commits'>;
  workingTree?: ToWebviewOf<'workingTree'>;
  files?: ToWebviewOf<'files'>;
  diff?: ToWebviewOf<'diff'> | ToWebviewOf<'fileContent'>;
  fileDiffs?: ReadonlyMap<string, ToWebviewOf<'fileDiff'>>;
  tree?: ToWebviewOf<'tree'>;
}

const navigationShown = 20;
const subjectsKept = 1000;

export function newTabState(): TabState {
  return {
    hash: undefined,
    index: undefined,
    path: undefined,
    entireFile: false,
    diffStale: false,
    changedFiles: new Map(),
    workingTree: undefined,
    fullHistory: [],
    inHistory: new Set(),
    subjects: new Map(),
    heads: new Set(),
    headCommit: undefined,
    fingerprint: '',
    anchor: undefined,
    opened: false,
    refCounts: new Map(),
    toggledMerges: new Set(),
    history: [],
    positions: new Map(),
    generation: 0,
    graph: new Graph([]),
    shownStale: false,
    shown: {},
    navigation: noNavigation,
  };
}

export function loadHistory(
  tab: TabState,
  fullHistory: readonly HistoryEntry[],
  head: Head | undefined,
  refs: readonly RefInfo[],
): void {
  tab.fullHistory = fullHistory;
  tab.inHistory = new Set(fullHistory.map((entry) => entry.hash));
  tab.heads = headsOf(fullHistory);
  takeRefs(tab, head, refs);
}

export function takeRefs(
  tab: TabState,
  head: Head | undefined,
  refs: readonly RefInfo[],
): void {
  tab.headCommit = head?.commit;
  tab.fingerprint = fingerprint(head, refs);
  tab.refCounts = countRefs(refs, head);
}

// The commits reachable from the tips are those of the history exactly when
// every tip is in it and every commit without children in it is a tip
export function refsKeepHistory(
  tab: TabState,
  head: Head | undefined,
  refs: readonly RefInfo[],
  solo: boolean,
): boolean {
  const tips = new Set(solo ? [] : refs.map((ref) => ref.commit));
  if (head?.commit) {
    tips.add(head.commit);
  }
  return (
    historyLoaded(tab) &&
    [...tips].every((tip) => tab.inHistory.has(tip)) &&
    [...tab.heads].every((commit) => tips.has(commit))
  );
}

export function historyLoaded(tab: TabState): boolean {
  return tab.fingerprint !== '';
}

export function forgetHistory(tab: TabState): void {
  tab.fingerprint = '';
}

export function layOutHistory(
  tab: TabState,
  collapse: boolean,
  head: string | undefined,
): number {
  const tips = new Set(tab.heads);
  if (head) {
    tips.add(head);
  }
  const history = showHistory(tab.fullHistory, tips, isExpanded(tab, collapse));
  tab.history = history;
  tab.positions = positionsOf(tab.fullHistory, history);
  tab.graph = new Graph(history, { head });
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
): ToWebviewOf<'commits'> {
  const { start, scrollTarget } = page;
  return {
    type: 'commits',
    generation: tab.generation,
    total: tab.history.length,
    decorations: decorations(tab.refCounts, tab.positions),
    start,
    commits,
    graph: tab.graph.rows(start, commits.length),
    workingTreeGraph: tab.graph.workingTreeRow,
    selectedIndex: tab.index,
    keysFrom: keysFrom(tab),
    scrollTarget,
  };
}

function keysFrom(tab: TabState): number | undefined {
  const { hash } = tab;
  if (
    tab.index !== undefined ||
    hash === undefined ||
    !tab.inHistory.has(hash)
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

function isExpanded(
  tab: TabState,
  collapse: boolean,
): (hash: string, isPull: boolean) => boolean {
  return (hash, isPull) =>
    (collapse && !isPull) === tab.toggledMerges.has(hash);
}

export function mergesHidingCommit(tab: TabState, hash: string): string[] {
  return mergesHiding(tab.fullHistory, tab.positions, hash);
}

export function select(tab: TabState, hash: string | undefined): void {
  tab.hash = hash;
  tab.index = positionOf(tab, hash);
  tab.path = undefined;
  tab.entireFile = false;
}

function anchorOf(tab: TabState): ScrollTarget | undefined {
  if (!tab.anchor) {
    return undefined;
  }
  if (tab.anchor.hash === workingTreeHash) {
    return { index: workingTreeIndex, offset: 0 };
  }
  const index = tab.positions.get(tab.anchor.hash);
  return index === undefined ? undefined : { index, offset: tab.anchor.offset };
}

function indexTarget(index: number | undefined): ScrollTarget | undefined {
  return index === undefined ? undefined : { index };
}

export function keep(shown: Shown, message: ToWebview): void {
  switch (message.type) {
    case 'repository':
      shown.repository = message;
      break;
    case 'fetching':
      shown.fetching = message;
      break;
    case 'applyingSolo':
      shown.applyingSolo = message;
      break;
    case 'navigation':
      shown.navigation = message;
      break;
    case 'commits':
      shown.commits = message;
      break;
    case 'workingTree':
      shown.workingTree = message;
      break;
    case 'files':
      shown.files = message;
      break;
    case 'diff':
    case 'fileContent':
      shown.diff = message;
      shown.fileDiffs = undefined;
      break;
    case 'fileDiff':
      shown.fileDiffs = new Map(shown.fileDiffs).set(message.path, message);
      break;
    case 'tree':
      shown.tree = message;
      break;
  }
}

export function replayOf(tab: TabState): ToWebview[] {
  const { shown } = tab;
  return [
    shown.repository,
    shown.fetching,
    shown.applyingSolo,
    shown.navigation,
    shown.commits && {
      ...shown.commits,
      selectedIndex: tab.index,
      keysFrom: keysFrom(tab),
      scrollTarget: anchorOf(tab) ?? indexTarget(tab.index),
    },
    shown.workingTree,
    shown.files,
    shown.diff,
    shown.tree,
  ].filter((message) => message !== undefined);
}

export function stillThere(tab: TabState): (hash: string) => boolean {
  return (hash) =>
    sidesOf(hash).every(
      (side) => side === workingTreeHash || tab.inHistory.has(side),
    );
}

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
      hash === workingTreeHash ? workingTreeSubject : tab.subjects.get(hash),
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

function positionOf(
  tab: TabState,
  selection: string | undefined,
): number | undefined {
  const hash = comparedOf(selection)?.to ?? selection;
  if (hash === workingTreeHash) {
    return workingTreeIndex;
  }
  return hash === undefined ? undefined : tab.positions.get(hash);
}
