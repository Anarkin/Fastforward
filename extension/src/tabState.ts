import type { HistoryEntry } from './git/history';
import type { WorkingTree } from './git/workingTree';
import { Graph } from './history/graph';
import {
  headsOf,
  mergesHiding,
  showHistory,
  type ShownEntry,
} from './history/merges';
import { noNavigation, type Navigation } from './history/navigation';
import { countRefs, decorations, fingerprint, type Head } from './refs';
import {
  commitPageSize,
  workingTreeHash,
  type CommitInfo,
  type FileChange,
  type NavigationEntry,
  type RefInfo,
  type ToWebview,
} from './shared/protocol';

// What the extension keeps of a tab, and works out from it, without git or
// VS Code, so the unit tests can use it outside VS Code

// Kept in the extension, because the webview is recreated every time the modal
// opens
export interface TabState {
  hash: string | undefined;
  // Position of the selected commit in the history
  index: number | undefined;
  path: string | undefined;
  // The files the selected commit changed; others picked in the Files view
  // are shown whole instead of as a diff
  changedFiles: Map<string, FileChange>;
  // The uncommitted changes those files are, when they are selected, whose
  // diff is taken against the same base and untracked files
  workingTree: WorkingTree | undefined;
  // Every commit of every branch, remote and tag, newest first, and their
  // hashes, to tell whether one is still there
  fullHistory: readonly HistoryEntry[];
  inHistory: Set<string>;
  // The subjects of the commits sent, which the back and forward dropdowns
  // list without asking git again
  subjects: Map<string, string>;
  // Its commits that nothing is built on yet
  heads: Set<string>;
  // HEAD and every ref when the history loaded; the history is reloaded when
  // they change
  fingerprint: string;
  // The commit at the top of the list and how far it is scrolled into it,
  // which a reload keeps in place
  anchor: { hash: string; offset: number } | undefined;
  // Whether the tab was loaded in this session, opened or preloaded; the
  // first load starts it at HEAD
  opened: boolean;
  // The commits shown before and after, for back and forward
  navigation: Navigation;
  // The commits refs point at, which are always shown, and how many refs
  // point at each
  refCounts: Map<string, number>;
  // Merges the user expanded or collapsed, unlike the setting says
  toggledMerges: Set<string>;
  // The commits shown, with merges collapsed or expanded, and each commit's
  // position in it; pages and jumps are looked up here
  history: readonly ShownEntry[];
  positions: Map<string, number>;
  // Counts the histories shown, so a page asked of one isn't answered from
  // the next, and a list that took longer to send than a newer one is dropped
  generation: number;
  // The lanes of the history, laid out when it loads
  graph: Graph;
  // The merge setting changed while the tab was in the background, which
  // shows its history again when it comes back, without reloading it
  shownStale: boolean;
  shown: Shown;
}

type Message<T extends ToWebview['type']> = Extract<ToWebview, { type: T }>;

// What a tab shows, from the last messages sent for it, which are replayed
// when the tab or the modal opens again so it shows up instantly, before the
// refresh; only these, as the others either happen once, like jumps and
// errors, are answers the page asks for again, like pages of commits, large
// files' diffs and hash lookups, or are saved elsewhere, like the bookmarks
interface Shown {
  repository?: Message<'repository'>;
  fetching?: Message<'fetching'>;
  navigation?: Message<'navigation'>;
  commits?: Message<'commits'>;
  workingTree?: Message<'workingTree'>;
  files?: Message<'files'>;
  // The Diff column shows a diff or a whole file, whichever came last
  diff?: Message<'diff'> | Message<'fileContent'>;
  tree?: Message<'tree'>;
}

// The steps each way the history's dropdowns list
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

// Takes in a history loaded from git, with HEAD and the refs it was loaded at
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

// Works out which commits are shown with the merges collapsed or expanded,
// and lays out their graph; the generation of the new list
export function layOutHistory(
  tab: TabState,
  collapse: boolean,
  head: string | undefined,
): number {
  // Tips of branches that aren't merged, like Sublime Merge; merged branches
  // stay inside their collapsed merge even when a ref still points at them
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
  // The selected commit may have moved, or be hidden in a collapsed merge
  tab.index = tab.hash === undefined ? undefined : tab.positions.get(tab.hash);
  return ++tab.generation;
}

// The page the list shows first: the top, or around the commit that stays in
// place, so the list doesn't flash placeholders there
export function firstPage(
  tab: TabState,
  keepPlace: boolean,
): { start: number; anchor: { index: number; offset: number } | undefined } {
  const anchor = keepPlace ? anchorOf(tab) : undefined;
  const start =
    anchor === undefined || anchor.index < 0
      ? 0
      : anchor.index - (anchor.index % commitPageSize);
  return { start, anchor };
}

// A new list of the history laid out last, starting with the first page's
// commits; scrollTo is a commit to keep in view, the selected one by default
export function commitsMessage(
  tab: TabState,
  page: ReturnType<typeof firstPage>,
  commits: readonly CommitInfo[],
  scrollTo: string | undefined,
): Message<'commits'> {
  const { start, anchor } = page;
  return {
    type: 'commits',
    generation: tab.generation,
    total: tab.history.length,
    decorations: decorations(tab.refCounts, tab.positions),
    graphWidth: tab.graph.width,
    start,
    commits,
    graph: tab.graph.rows(start, commits.length),
    workingTreeGraph: tab.graph.workingTreeRow,
    selectedIndex:
      scrollTo === undefined ? tab.index : tab.positions.get(scrollTo),
    anchor,
  };
}

// Expands these merges, whatever the setting says
export function expandMerges(
  tab: TabState,
  merges: readonly string[],
  collapse: boolean,
): void {
  for (const merge of merges) {
    // Toggled merges are the ones that differ from the setting
    if (collapse) {
      tab.toggledMerges.add(merge);
    } else {
      tab.toggledMerges.delete(merge);
    }
  }
}

// The merges to expand so a commit of the history is shown
export function mergesHidingCommit(tab: TabState, hash: string): string[] {
  return mergesHiding(tab.fullHistory, tab.positions, hash);
}

// Selects a commit at its position in the list
export function select(tab: TabState, hash: string, index: number): void {
  tab.hash = hash;
  tab.index = index;
  tab.path = undefined;
}

// Where the list keeps its place: the commit that was at its top, or the
// very top, above the working tree's row, when it was scrolled all the way
// up, where new commits show up; nothing for a commit no longer shown
function anchorOf(
  tab: TabState,
): { index: number; offset: number } | undefined {
  if (!tab.anchor) {
    return undefined;
  }
  if (tab.anchor.hash === workingTreeHash) {
    return { index: -1, offset: 0 };
  }
  const index = tab.positions.get(tab.anchor.hash);
  return index === undefined ? undefined : { index, offset: tab.anchor.offset };
}

// Keeps a message the tab replays, in place of the one before it
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
    default:
      break;
  }
}

// What the page is sent when the tab opens again, with the files before the
// diff, as when a commit is selected
export function replayOf(tab: TabState): ToWebview[] {
  const { shown } = tab;
  return [
    shown.repository,
    shown.fetching,
    shown.navigation,
    // The list comes back where it was scrolled to, or else at the commit
    // selected since it was sent
    shown.commits && {
      ...shown.commits,
      selectedIndex: tab.index,
      anchor: anchorOf(tab),
    },
    shown.workingTree,
    shown.files,
    shown.diff,
    shown.tree,
  ].filter((message) => message !== undefined);
}

// Whether a step of the back and forward history can still be gone to: the
// uncommitted changes always can, a commit while the history has it
export function stillThere(tab: TabState): (hash: string) => boolean {
  return (hash) => hash === workingTreeHash || tab.inHistory.has(hash);
}

// The history's nearest steps both ways, for the buttons and their
// dropdowns; only the steps whose commit is still there, which are the ones
// navigate counts, so a picked step is the one it goes to
export function nearestSteps(tab: TabState): {
  back: string[];
  forward: string[];
} {
  const exists = stillThere(tab);
  const nearest = (steps: readonly string[]) =>
    steps.filter(exists).toReversed().slice(0, navigationShown);
  return {
    back: nearest(tab.navigation.back),
    forward: nearest(tab.navigation.forward),
  };
}

// A step as the dropdowns list it, with its subject when it is known
export function navigationEntry(tab: TabState, hash: string): NavigationEntry {
  return {
    hash,
    subject:
      hash === workingTreeHash ? 'Uncommitted changes' : tab.subjects.get(hash),
  };
}

// Remembers the subjects of commits sent to the page
export function keepSubjects(
  tab: TabState,
  commits: readonly CommitInfo[],
): void {
  for (const commit of commits) {
    tab.subjects.set(commit.hash, commit.subject);
  }
}

// Where a commit is in the list; the working tree's row is above the first
export function positionOf(
  tab: TabState,
  hash: string | undefined,
): number | undefined {
  if (hash === workingTreeHash) {
    return -1;
  }
  return hash === undefined ? undefined : tab.positions.get(hash);
}
