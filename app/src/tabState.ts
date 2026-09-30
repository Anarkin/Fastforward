import type { HistoryEntry } from './git/history';
import type { WorkingTree } from './git/workingTree';
import { Graph } from './history/graph';
import {
  headsOf,
  mergesHiding,
  showHistory,
  type ShownEntry,
} from './history/merges';
import { noNavigation, reachable, type Navigation } from './history/navigation';
import { countRefs, decorations, fingerprint, type Head } from './refs';
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
  changedFiles: Map<string, FileChange>;
  workingTree: WorkingTree | undefined;
  fullHistory: readonly HistoryEntry[];
  inHistory: Set<string>;
  subjects: Map<string, string>;
  heads: Set<string>;
  fingerprint: string;
  anchor: { hash: string; offset: number } | undefined;
  opened: boolean;
  navigation: Navigation;
  refCounts: Map<string, number>;
  toggledMerges: Set<string>;
  history: readonly ShownEntry[];
  positions: Map<string, number>;
  generation: number;
  graph: Graph;
  shownStale: boolean;
  shown: Shown;
}

interface Shown {
  repository?: ToWebviewOf<'repository'>;
  fetching?: ToWebviewOf<'fetching'>;
  navigation?: ToWebviewOf<'navigation'>;
  commits?: ToWebviewOf<'commits'>;
  workingTree?: ToWebviewOf<'workingTree'>;
  files?: ToWebviewOf<'files'>;
  diff?: ToWebviewOf<'diff'> | ToWebviewOf<'fileContent'>;
  tree?: ToWebviewOf<'tree'>;
}

const navigationShown = 20;

export function newTabState(): TabState {
  return {
    hash: undefined,
    index: undefined,
    path: undefined,
    changedFiles: new Map(),
    workingTree: undefined,
    fullHistory: [],
    inHistory: new Set(),
    subjects: new Map(),
    heads: new Set(),
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
  tab.fingerprint = fingerprint(head, refs);
  tab.refCounts = countRefs(refs, head);
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
  const history = showHistory(
    tab.fullHistory,
    tips,
    (hash) => collapse === tab.toggledMerges.has(hash),
  );
  tab.history = history;
  tab.positions = new Map(history.map((entry, index) => [entry.hash, index]));
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
    scrollTarget,
  };
}

export function expandMerges(
  tab: TabState,
  merges: readonly string[],
  collapse: boolean,
): void {
  for (const merge of merges) {
    if (collapse) {
      tab.toggledMerges.add(merge);
    } else {
      tab.toggledMerges.delete(merge);
    }
  }
}

export function mergesHidingCommit(tab: TabState, hash: string): string[] {
  return mergesHiding(tab.fullHistory, tab.positions, hash);
}

export function select(tab: TabState, hash: string | undefined): void {
  tab.hash = hash;
  tab.index = positionOf(tab, hash);
  tab.path = undefined;
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
    shown.navigation,
    shown.commits && {
      ...shown.commits,
      selectedIndex: tab.index,
      scrollTarget: anchorOf(tab) ?? indexTarget(tab.index),
    },
    shown.workingTree,
    shown.files,
    shown.diff,
    shown.tree,
  ].filter((message) => message !== undefined);
}

export function stillThere(tab: TabState): (hash: string) => boolean {
  return (hash) => hash === workingTreeHash || tab.inHistory.has(hash);
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
  for (const commit of commits) {
    tab.subjects.set(commit.hash, commit.subject);
  }
}

function positionOf(
  tab: TabState,
  hash: string | undefined,
): number | undefined {
  if (hash === workingTreeHash) {
    return workingTreeIndex;
  }
  return hash === undefined ? undefined : tab.positions.get(hash);
}
