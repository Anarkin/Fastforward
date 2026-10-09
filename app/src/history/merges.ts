import type { HistoryEntry } from '../git/history';
import type { Commits } from './commits';

export interface ShownEntry extends HistoryEntry {
  readonly merge?: 'collapsed' | 'expanded';
  readonly hidden?: number;
}

export interface Positions {
  get(hash: string): number | undefined;
  has(hash: string): boolean;
}

const plain = 0;
const collapsed = 1;
const expanded = 2;

export class Shown {
  readonly positions: Positions;

  constructor(
    readonly commits: Commits,
    private readonly rows: Int32Array,
    private readonly flags: Uint8Array,
    private readonly merges: Uint8Array,
    private readonly hiddenCounts: Int32Array,
    private readonly rowOf: Int32Array,
  ) {
    const get = (hash: string) => {
      const at = commits.indexOf(hash);
      const row = at === undefined ? -1 : rowOf[at];
      return row === -1 ? undefined : row;
    };
    this.positions = { get, has: (hash) => get(hash) !== undefined };
  }

  get length(): number {
    return this.rows.length;
  }

  key(row: number): number {
    return this.rows[row];
  }

  hashAt(row: number): string {
    return this.commits.hashAt(this.rows[row]);
  }

  hashes(start: number, end: number): string[] {
    const hashes: string[] = [];
    for (let row = start; row < Math.min(end, this.length); row++) {
      hashes.push(this.hashAt(row));
    }
    return hashes;
  }

  parents(row: number): number[] {
    const { starts, parents } = this.commits;
    const at = this.rows[row];
    const shown: number[] = [];
    for (let parent = starts[at]; parent < starts[at + 1]; parent++) {
      if (this.flags[parents[parent]]) {
        shown.push(parents[parent]);
      }
    }
    return shown;
  }

  firstParent(row: number): string | undefined {
    const [first] = this.parents(row);
    return first === undefined ? undefined : this.commits.hashAt(first);
  }

  merge(row: number): 'collapsed' | 'expanded' | undefined {
    const merge = this.merges[row];
    return merge === plain
      ? undefined
      : merge === expanded
        ? 'expanded'
        : 'collapsed';
  }

  hidden(row: number): number | undefined {
    return this.hiddenCounts[row] || undefined;
  }

  entry(row: number): ShownEntry {
    const hash = this.hashAt(row);
    const parents = this.parents(row).map((at) => this.commits.hashAt(at));
    const merge = this.merge(row);
    return merge === undefined
      ? { hash, parents }
      : { hash, parents, merge, hidden: this.hidden(row) };
  }

  firstRows(count: number): Shown {
    const rows = this.rows.subarray(0, count);
    const rowOf = new Int32Array(this.rowOf.length).fill(-1);
    rows.forEach((at, row) => {
      rowOf[at] = row;
    });
    return new Shown(
      this.commits,
      rows,
      this.flags,
      this.merges.subarray(0, count),
      this.hiddenCounts.subarray(0, count),
      rowOf,
    );
  }
}

export function headsOf(commits: Commits): Set<string> {
  const { length, parents } = commits;
  const hasChild = new Uint8Array(length);
  for (const parent of parents) {
    if (parent < length) {
      hasChild[parent] = 1;
    }
  }
  const heads = new Set<string>();
  for (let at = 0; at < length; at++) {
    if (!hasChild[at]) {
      heads.add(commits.hashAt(at));
    }
  }
  return heads;
}

export function mergesHiding(
  commits: Commits,
  shown: { has(hash: string): boolean },
  target: string,
): string[] {
  const start = commits.indexOf(target);
  if (start === undefined) {
    return [];
  }
  const { starts, parents } = commits;
  const children = childrenOf(commits);
  const firstParent = (at: number) =>
    at < commits.length && starts[at] < starts[at + 1]
      ? parents[starts[at]]
      : undefined;
  const cameFrom = new Map<number, number>();
  const queue = [start];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (
      let child = children.starts[next];
      child < children.starts[next + 1];
      child++
    ) {
      const at = children.children[child];
      if (cameFrom.has(at)) {
        continue;
      }
      cameFrom.set(at, next);
      if (!shown.has(commits.hashAt(at))) {
        queue.push(at);
        continue;
      }
      const merges: string[] = [];
      for (let step = at; step !== start;) {
        const parent = cameFrom.get(step);
        if (parent === undefined) {
          break;
        }
        if (firstParent(step) !== parent) {
          merges.push(commits.hashAt(step));
        }
        step = parent;
      }
      return merges;
    }
  }
  return [];
}

export function mergeExpanded(
  commits: Commits,
  hash: string,
  isExpanded: (hash: string, isPull: boolean) => boolean,
): boolean {
  const at = commits.indexOf(hash);
  return (
    at !== undefined &&
    at < commits.length &&
    isExpanded(hash, isPull(commits, at))
  );
}

interface Children {
  readonly starts: Int32Array;
  readonly children: Int32Array;
}

const knownChildren = new WeakMap<Commits, Children>();

function childrenOf(commits: Commits): Children {
  const known = knownChildren.get(commits);
  if (known) {
    return known;
  }
  const { length, size, starts, parents } = commits;
  const counts = new Int32Array(size + 1);
  for (const parent of parents) {
    counts[parent + 1]++;
  }
  for (let at = 0; at < size; at++) {
    counts[at + 1] += counts[at];
  }
  const filled = counts.slice(0, size);
  const children = new Int32Array(parents.length);
  for (let at = 0; at < length; at++) {
    for (let parent = starts[at]; parent < starts[at + 1]; parent++) {
      children[filled[parents[parent]]++] = at;
    }
  }
  const result = { starts: counts, children };
  knownChildren.set(commits, result);
  return result;
}

export function showHistory(
  commits: Commits,
  tips: ReadonlySet<string>,
  isExpanded: (hash: string, isPull: boolean) => boolean,
  partial = false,
): Shown {
  const { length, size, starts, parents } = commits;
  const shown = new Uint8Array(size);
  for (const tip of tips) {
    const at = commits.indexOf(tip);
    if (at !== undefined) {
      shown[at] = 1;
    }
  }
  const expandedMerges = new Uint8Array(length);
  let count = 0;
  for (let at = 0; at < length; at++) {
    if (!shown[at]) {
      continue;
    }
    count++;
    const first = starts[at];
    let end = starts[at + 1];
    if (end - first > 1) {
      if (isExpanded(commits.hashAt(at), isPull(commits, at))) {
        expandedMerges[at] = 1;
      } else {
        end = first + 1;
      }
    }
    for (let parent = first; parent < end; parent++) {
      shown[parents[parent]] = 1;
    }
  }
  const hidden = countHidden(commits, shown, partial);
  const rows = new Int32Array(count);
  const merges = new Uint8Array(count);
  const hiddenCounts = new Int32Array(count);
  const rowOf = new Int32Array(size).fill(-1);
  let row = 0;
  for (let at = 0; at < length; at++) {
    if (!shown[at]) {
      continue;
    }
    rows[row] = at;
    rowOf[at] = row;
    if (starts[at + 1] - starts[at] > 1) {
      merges[row] = expandedMerges[at] ? expanded : collapsed;
      hiddenCounts[row] = hidden[at];
    }
    row++;
  }
  return new Shown(commits, rows, shown, merges, hiddenCounts, rowOf);
}

// Walks both first-parent chains to where they meet, which works as parents
// always come after their children, also those outside the history
function isPull({ length, starts, parents }: Commits, at: number) {
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
  { length, starts, parents }: Commits,
  shown: Uint8Array,
  partial: boolean,
): Int32Array {
  const counted = new Uint8Array(shown.length);
  const counts = new Int32Array(length);
  const stack: number[] = [];
  for (let at = length - 1; at >= 0; at--) {
    if (!shown[at] || starts[at + 1] - starts[at] < 2) {
      continue;
    }
    let count = 0;
    let unknown = false;
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
      } else {
        unknown = true;
      }
    }
    counts[at] = partial && unknown ? 0 : count;
  }
  return counts;
}
