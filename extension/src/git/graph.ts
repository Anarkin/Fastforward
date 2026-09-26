import type { GraphLine, GraphRow } from '../protocol';
import type { ShownEntry } from './merges';

// The lanes between two rows: the commit each lane is waiting for, which is a
// parent of a commit above, and the lane's color
interface Lanes {
  readonly hashes: (string | undefined)[];
  readonly colors: number[];
  nextColor: number;
}

function copy(lanes: Lanes): Lanes {
  return {
    hashes: [...lanes.hashes],
    colors: [...lanes.colors],
    nextColor: lanes.nextColor,
  };
}

// A free lane for a new line: the first empty one, or a new one on the right
function allocate(lanes: Lanes, hash: string): number {
  let lane = lanes.hashes.indexOf(undefined);
  if (lane === -1) {
    lane = lanes.hashes.length;
  }
  lanes.hashes[lane] = hash;
  lanes.colors[lane] = lanes.nextColor++;
  return lane;
}

// Lays out one commit, updating the lanes to what the rows below see
function step(lanes: Lanes, entry: ShownEntry): GraphRow {
  const lines: GraphLine[] = [];
  const before = [...lanes.hashes];

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
      lines.push({ from, to: lane, color: lanes.colors[from], bottom: false });
      if (from !== lane) {
        lanes.hashes[from] = undefined;
      }
    } else if (hash !== undefined) {
      lines.push({ from, to: from, color: lanes.colors[from], bottom: false });
    }
  });

  // Below the commit: its first parent continues in its lane, other parents
  // join the lanes waiting for them or start new ones
  const [first, ...others] = entry.parents;
  lanes.hashes[lane] = first;
  // Lanes that start at this commit's merge line, not above it
  const started = new Set<number>();
  for (const parent of others) {
    let to = lanes.hashes.indexOf(parent);
    if (to === -1) {
      to = allocate(lanes, parent);
      started.add(to);
    }
    lines.push({ from: lane, to, color: lanes.colors[to], bottom: true });
  }
  lanes.hashes.forEach((hash, from) => {
    if (hash !== undefined && !started.has(from)) {
      lines.push({ from, to: from, color: lanes.colors[from], bottom: true });
    }
  });

  // Empty lanes on the right are dropped, so the graph narrows again
  while (
    lanes.hashes.length > 0 &&
    lanes.hashes[lanes.hashes.length - 1] === undefined
  ) {
    lanes.hashes.pop();
    lanes.colors.pop();
  }
  return { lane, color, lines, merge: entry.merge, hidden: entry.hidden };
}

// Lays out the graph of a history once, keeping the lanes every so many rows,
// so the rows of any page can be recomputed quickly without keeping them all
export class Graph {
  private readonly checkpoints: Lanes[] = [];
  // The most lanes any row uses, for the width of the graph
  readonly width: number;

  constructor(
    private readonly history: readonly ShownEntry[],
    private readonly checkpointEvery = 100,
  ) {
    const lanes: Lanes = { hashes: [], colors: [], nextColor: 0 };
    let width = 0;
    history.forEach((entry, index) => {
      if (index % checkpointEvery === 0) {
        this.checkpoints.push(copy(lanes));
      }
      const row = step(lanes, entry);
      width = Math.max(width, row.lane + 1, ...row.lines.map((l) => l.to + 1));
    });
    this.width = width;
  }

  rows(start: number, count: number): GraphRow[] {
    const checkpoint = Math.floor(start / this.checkpointEvery);
    const from = this.checkpoints[checkpoint];
    if (!from) {
      return [];
    }
    const lanes = copy(from);
    const rows: GraphRow[] = [];
    const end = Math.min(start + count, this.history.length);
    for (let index = checkpoint * this.checkpointEvery; index < end; index++) {
      const row = step(lanes, this.history[index]);
      if (index >= start) {
        rows.push(row);
      }
    }
    return rows;
  }
}
