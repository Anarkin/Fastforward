import type { GraphLine, GraphRow } from '../protocol';
import type { ShownEntry } from './merges';

// The lanes between two rows: the commit each lane is waiting for, which is a
// parent of a commit above, and the lane's color
interface Lanes {
  readonly hashes: (string | undefined)[];
  readonly colors: number[];
  // Lanes from the working tree to HEAD, which are drawn dotted
  readonly dashed: boolean[];
  nextColor: number;
}

function copy(lanes: Lanes): Lanes {
  return {
    hashes: [...lanes.hashes],
    colors: [...lanes.colors],
    dashed: [...lanes.dashed],
    nextColor: lanes.nextColor,
  };
}

// The working tree's row, above every commit, like Sublime Merge's; its lane
// leads to HEAD, so branches built on HEAD move aside
const workingTree = '';

// A free lane for a new line: the first empty one, or a new one on the right
function allocate(lanes: Lanes, hash: string): number {
  let lane = lanes.hashes.indexOf(undefined);
  if (lane === -1) {
    lane = lanes.hashes.length;
  }
  lanes.hashes[lane] = hash;
  lanes.colors[lane] = lanes.nextColor++;
  lanes.dashed[lane] = false;
  return lane;
}

// Lays out one commit, updating the lanes to what the rows below see
function step(lanes: Lanes, entry: ShownEntry): GraphRow {
  const lines: GraphLine[] = [];
  const before = [...lanes.hashes];
  const line = (from: number, to: number, color: number, bottom: boolean) =>
    lines.push(
      lanes.dashed[from]
        ? { from, to, color, bottom, dashed: true }
        : { from, to, color, bottom },
    );

  // The commit takes the first lane waiting for it; a branch tip that nothing
  // is waiting for starts a new lane
  let lane = before.indexOf(entry.hash);
  if (lane === -1) {
    lane = allocate(lanes, entry.hash);
  }
  const color = lanes.colors[lane];

  // Above the commit: its lanes run into it, the others pass by
  before.forEach((hash, from) => {
    if (hash === entry.hash) {
      line(from, lane, lanes.colors[from], false);
      if (from !== lane) {
        lanes.hashes[from] = undefined;
      }
    } else if (hash !== undefined) {
      line(from, from, lanes.colors[from], false);
    }
  });

  // Below the commit: its first parent continues in its lane, other parents
  // join the lanes waiting for them or start new ones
  const [first, ...others] = entry.parents;
  lanes.hashes[lane] = first;
  lanes.dashed[lane] = entry.hash === workingTree;
  // Lanes that start at this commit's merge line, not above it
  const started = new Set<number>();
  for (const parent of others) {
    let to = lanes.hashes.indexOf(parent);
    if (to === -1) {
      to = allocate(lanes, parent);
      started.add(to);
    }
    line(lane, to, lanes.colors[to], true);
  }
  lanes.hashes.forEach((hash, from) => {
    if (hash !== undefined && !started.has(from)) {
      line(from, from, lanes.colors[from], true);
    }
  });

  // Empty lanes on the right are dropped, so the graph narrows again
  while (
    lanes.hashes.length > 0 &&
    lanes.hashes[lanes.hashes.length - 1] === undefined
  ) {
    lanes.hashes.pop();
    lanes.colors.pop();
    lanes.dashed.pop();
  }
  return entry.hash === workingTree
    ? { lane, color, lines, workingTree: true }
    : { lane, color, lines, merge: entry.merge, hidden: entry.hidden };
}

// Lays out the graph of a history once, keeping the lanes every so many rows,
// so the rows of any page can be recomputed quickly without keeping them all;
// the working tree's row comes first, based on HEAD when it is shown
export class Graph {
  private readonly checkpoints: Lanes[] = [];
  private readonly entries: readonly ShownEntry[];
  private readonly checkpointEvery: number;
  // The most lanes any row uses, for the width of the graph
  readonly width: number;
  readonly workingTreeRow: GraphRow;

  constructor(
    history: readonly ShownEntry[],
    {
      head,
      checkpointEvery = 100,
    }: { head?: string; checkpointEvery?: number } = {},
  ) {
    const shown =
      head !== undefined && history.some((entry) => entry.hash === head);
    this.entries = [
      { hash: workingTree, parents: shown ? [head] : [] },
      ...history,
    ];
    this.checkpointEvery = checkpointEvery;
    const lanes: Lanes = { hashes: [], colors: [], dashed: [], nextColor: 0 };
    let width = 0;
    let workingTreeRow: GraphRow | undefined;
    this.entries.forEach((entry, index) => {
      if (index % checkpointEvery === 0) {
        this.checkpoints.push(copy(lanes));
      }
      const row = step(lanes, entry);
      workingTreeRow ??= row;
      width = Math.max(width, row.lane + 1, ...row.lines.map((l) => l.to + 1));
    });
    this.width = width;
    this.workingTreeRow = workingTreeRow ?? { lane: 0, color: 0, lines: [] };
  }

  // The rows of the commits at positions start.., which come after the
  // working tree's
  rows(start: number, count: number): GraphRow[] {
    const first = start + 1;
    const checkpoint = Math.floor(first / this.checkpointEvery);
    const from = this.checkpoints[checkpoint];
    if (!from) {
      return [];
    }
    const lanes = copy(from);
    const rows: GraphRow[] = [];
    const end = Math.min(first + count, this.entries.length);
    for (let index = checkpoint * this.checkpointEvery; index < end; index++) {
      const row = step(lanes, this.entries[index]);
      if (index >= first) {
        rows.push(row);
      }
    }
    return rows;
  }
}
