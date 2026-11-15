import type { Stash } from './stashes';
import type { WorkingTree } from './workingTree';
import { Commits } from './commits';
import { Graph } from './graph';
import {
  showHistory,
  type Positions,
  type Shown as ShownHistory,
} from './merges';
import { noNavigation, type Navigation } from './navigation';
import { shownSide, sidesOf } from '../shared/comparisons';
import {
  workingTreeHash,
  workingTreeIndex,
  type ChangeArea,
  type FileChange,
} from '../shared/protocol';
import type { Shown } from './tabReplay';

export interface TabState {
  hash: string | undefined;
  index: number | undefined;
  path: string | undefined;
  area: ChangeArea | undefined;
  diffStale: boolean;
  changedFiles: Map<string, FileChange>;
  stagedFiles: Map<string, FileChange>;
  allFiles: Map<string, FileChange> | undefined;
  workingTree: WorkingTree | undefined;
  fullHistory: Commits;
  partial: boolean;
  subjects: Map<string, string>;
  heads: Set<string>;
  ranks: ReadonlyMap<string, number>;
  headCommit: string | undefined;
  stashes: ReadonlyMap<string, Stash>;
  fingerprint: string;
  shallow: string;
  anchor: { hash: string; offset: number; report: number } | undefined;
  opened: boolean;
  navigation: Navigation;
  decorated: Set<string>;
  toggledMerges: Set<string>;
  history: ShownHistory;
  positions: Positions;
  generation: number;
  graph: Graph;
  shownStale: boolean;
  shown: Shown;
}

export function newTabState(): TabState {
  return {
    hash: undefined,
    index: undefined,
    path: undefined,
    area: undefined,
    diffStale: false,
    changedFiles: new Map(),
    stagedFiles: new Map(),
    allFiles: undefined,
    workingTree: undefined,
    fullHistory: noCommits,
    partial: false,
    subjects: new Map(),
    heads: new Set(),
    ranks: new Map(),
    headCommit: undefined,
    stashes: new Map(),
    fingerprint: '',
    shallow: '',
    anchor: undefined,
    opened: false,
    decorated: new Set(),
    toggledMerges: new Set(),
    history: noneShown,
    positions: noneShown.positions,
    generation: 0,
    graph: new Graph(noneShown),
    shownStale: false,
    shown: {},
    navigation: noNavigation,
  };
}

const noCommits = Commits.of([]);
const noneShown = showHistory(noCommits, new Set(), () => false);

export function select(tab: TabState, hash: string | undefined): void {
  tab.hash = hash;
  tab.index = positionOf(tab, hash);
  tab.path = undefined;
  tab.area = undefined;
}

export function changesOf(tab: TabState): Map<string, FileChange> {
  if (tab.area === 'staged') {
    return tab.stagedFiles;
  }
  return (
    (tab.area === undefined ? tab.allFiles : undefined) ?? tab.changedFiles
  );
}

export function unselect(tab: TabState): void {
  select(tab, undefined);
  tab.shown.files = undefined;
  tab.shown.diff = undefined;
}

export function parentOf(tab: TabState): string | undefined {
  if (tab.hash === workingTreeHash) {
    return tab.headCommit;
  }
  const row = tab.index;
  return row !== undefined &&
    row >= 0 &&
    row < tab.history.length &&
    tab.history.hashAt(row) === tab.hash
    ? tab.history.firstParent(row)
    : undefined;
}

export function stillThere(tab: TabState): (hash: string) => boolean {
  return (hash) =>
    sidesOf(hash).every(
      (side) => side === workingTreeHash || tab.fullHistory.has(side),
    );
}

export function hiddenSides(tab: TabState, selection: string): string[] {
  return sidesOf(selection).filter(
    (side) => side !== workingTreeHash && !tab.positions.has(side),
  );
}

export function pickable(tab: TabState, selection: string): boolean {
  const selected = sidesOf(tab.hash);
  return hiddenSides(tab, selection).every((side) => selected.includes(side));
}

export function positionOf(
  tab: TabState,
  selection: string | undefined,
): number | undefined {
  const hash = shownSide(selection);
  if (hash === workingTreeHash) {
    return workingTreeIndex;
  }
  return hash === undefined ? undefined : tab.positions.get(hash);
}
