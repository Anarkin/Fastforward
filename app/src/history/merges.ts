import type { HistoryEntry } from '../git/history';

export interface ShownEntry extends HistoryEntry {
  readonly merge?: 'collapsed' | 'expanded';
  readonly hidden?: number;
}

export interface Positions {
  get(hash: string): number | undefined;
  has(hash: string): boolean;
}

export function positionsOf(
  history: readonly HistoryEntry[],
  shown: readonly ShownEntry[],
): Positions {
  const { index } = linksOf(history);
  const positions = new Int32Array(index.size).fill(-1);
  shown.forEach((entry, position) => {
    const at = index.get(entry.hash);
    if (at !== undefined) {
      positions[at] = position;
    }
  });
  const get = (hash: string) => {
    const at = index.get(hash);
    const position = at === undefined ? -1 : positions[at];
    return position === -1 ? undefined : position;
  };
  return { get, has: (hash) => get(hash) !== undefined };
}

export function headsOf(history: readonly HistoryEntry[]): Set<string> {
  const { parents } = linksOf(history);
  const hasChild = new Uint8Array(history.length);
  for (const parent of parents) {
    if (parent < history.length) {
      hasChild[parent] = 1;
    }
  }
  const heads = new Set<string>();
  history.forEach((entry, index) => {
    if (!hasChild[index]) {
      heads.add(entry.hash);
    }
  });
  return heads;
}

export function mergesHiding(
  history: readonly HistoryEntry[],
  shown: { has(hash: string): boolean },
  target: string,
): string[] {
  const children = childrenOf(history);
  const { index } = linksOf(history);
  const firstParent = (hash: string) => {
    const at = index.get(hash);
    return at === undefined ? undefined : history[at]?.parents[0];
  };
  const cameFrom = new Map<string, string>();
  const queue = [target];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const child of children.get(next) ?? []) {
      if (cameFrom.has(child)) {
        continue;
      }
      cameFrom.set(child, next);
      if (!shown.has(child)) {
        queue.push(child);
        continue;
      }
      const merges: string[] = [];
      for (let at = child; at !== target;) {
        const parent = cameFrom.get(at);
        if (parent === undefined) {
          break;
        }
        if (firstParent(at) !== parent) {
          merges.push(at);
        }
        at = parent;
      }
      return merges;
    }
  }
  return [];
}

export function mergeExpanded(
  history: readonly HistoryEntry[],
  hash: string,
  isExpanded: (hash: string, isPull: boolean) => boolean,
): boolean {
  const links = linksOf(history);
  const at = links.index.get(hash);
  return (
    at !== undefined &&
    at < history.length &&
    isExpanded(hash, isPull(links, history.length, at))
  );
}

const knownChildren = new WeakMap<
  readonly HistoryEntry[],
  ReadonlyMap<string, readonly string[]>
>();

function childrenOf(
  history: readonly HistoryEntry[],
): ReadonlyMap<string, readonly string[]> {
  const known = knownChildren.get(history);
  if (known) {
    return known;
  }
  const result = new Map<string, string[]>();
  for (const entry of history) {
    for (const parent of entry.parents) {
      const siblings = result.get(parent);
      if (siblings) {
        siblings.push(entry.hash);
      } else {
        result.set(parent, [entry.hash]);
      }
    }
  }
  knownChildren.set(history, result);
  return result;
}

// Parents missing from the history get the indices after its entries, so they
// can be marked shown like any commit; git's history has none, as it lists a
// shallow clone's boundary commits without parents
interface Links {
  readonly index: ReadonlyMap<string, number>;
  readonly starts: Int32Array;
  readonly parents: Int32Array;
}

const knownLinks = new WeakMap<readonly HistoryEntry[], Links>();

function linksOf(history: readonly HistoryEntry[]): Links {
  const known = knownLinks.get(history);
  if (known) {
    return known;
  }
  const index = new Map<string, number>();
  let count = 0;
  history.forEach((entry, at) => {
    index.set(entry.hash, at);
    count += entry.parents.length;
  });
  const starts = new Int32Array(history.length + 1);
  const parents = new Int32Array(count);
  let next = 0;
  history.forEach((entry, at) => {
    starts[at] = next;
    for (const parent of entry.parents) {
      let parentAt = index.get(parent);
      if (parentAt === undefined) {
        parentAt = index.size;
        index.set(parent, parentAt);
      }
      parents[next++] = parentAt;
    }
  });
  starts[history.length] = next;
  const result = { index, starts, parents };
  knownLinks.set(history, result);
  return result;
}

export function showHistory(
  history: readonly HistoryEntry[],
  tips: ReadonlySet<string>,
  isExpanded: (hash: string, isPull: boolean) => boolean,
): ShownEntry[] {
  const links = linksOf(history);
  const { index, starts, parents } = links;
  const shown = new Uint8Array(index.size);
  for (const tip of tips) {
    const at = index.get(tip);
    if (at !== undefined) {
      shown[at] = 1;
    }
  }
  const expanded = new Uint8Array(history.length);
  for (let at = 0; at < history.length; at++) {
    if (!shown[at]) {
      continue;
    }
    const first = starts[at];
    let end = starts[at + 1];
    if (end - first > 1) {
      if (isExpanded(history[at].hash, isPull(links, history.length, at))) {
        expanded[at] = 1;
      } else {
        end = first + 1;
      }
    }
    for (let parent = first; parent < end; parent++) {
      shown[parents[parent]] = 1;
    }
  }
  const hidden = countHidden(links, history.length, shown);
  const result: ShownEntry[] = [];
  for (let at = 0; at < history.length; at++) {
    if (!shown[at]) {
      continue;
    }
    const entry = history[at];
    const first = starts[at];
    const end = starts[at + 1];
    let allShown = true;
    for (let parent = first; parent < end; parent++) {
      allShown &&= shown[parents[parent]] === 1;
    }
    const shownParents = allShown
      ? entry.parents
      : entry.parents.filter((_, parent) => shown[parents[first + parent]]);
    result.push(
      end - first < 2
        ? { hash: entry.hash, parents: shownParents }
        : {
            hash: entry.hash,
            parents: shownParents,
            merge: expanded[at] ? 'expanded' : 'collapsed',
            hidden: hidden[at] || undefined,
          },
    );
  }
  return result;
}

// Walks both first-parent chains to where they meet, which works as parents
// always come after their children, also those outside the history
function isPull({ starts, parents }: Links, length: number, at: number) {
  const parentCount = (commit: number) =>
    commit < length ? starts[commit + 1] - starts[commit] : 0;
  const start = parents[starts[at]];
  let first = start;
  let second = parents[starts[at] + 1];
  if (parentCount(second) < 2) {
    return false;
  }
  while (first !== second) {
    if (first < second) {
      if (parentCount(first) !== 1) {
        return false;
      }
      first = parents[starts[first]];
    } else {
      if (parentCount(second) < 2) {
        return false;
      }
      second = parents[starts[second]];
    }
  }
  return first !== start;
}

function countHidden(
  { starts, parents }: Links,
  length: number,
  shown: Uint8Array,
): Int32Array {
  const counted = new Uint8Array(shown.length);
  const counts = new Int32Array(length);
  const stack: number[] = [];
  for (let at = length - 1; at >= 0; at--) {
    if (!shown[at] || starts[at + 1] - starts[at] < 2) {
      continue;
    }
    let count = 0;
    for (let parent = starts[at] + 1; parent < starts[at + 1]; parent++) {
      stack.push(parents[parent]);
    }
    for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
      if (shown[next] || counted[next]) {
        continue;
      }
      counted[next] = 1;
      count++;
      if (next < length) {
        for (let parent = starts[next]; parent < starts[next + 1]; parent++) {
          stack.push(parents[parent]);
        }
      }
    }
    counts[at] = count;
  }
  return counts;
}
