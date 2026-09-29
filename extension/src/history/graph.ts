import type { GraphLine, GraphRow } from '../shared/protocol';
import type { ShownEntry } from './merges';

interface Lanes {
  readonly hashes: (string | undefined)[];
  readonly colors: number[];
  readonly dashed: boolean[];
  nextColor: number;
  widest: number;
}

function copy(lanes: Lanes): Lanes {
  return {
    hashes: [...lanes.hashes],
    colors: [...lanes.colors],
    dashed: [...lanes.dashed],
    nextColor: lanes.nextColor,
    widest: lanes.widest,
  };
}

const workingTree = '';

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

function step(lanes: Lanes, entry: ShownEntry, drawLines = true): GraphRow {
  const lines: GraphLine[] = [];
  const before = [...lanes.hashes];
  const line = (from: number, to: number, color: number, bottom: boolean) => {
    if (drawLines) {
      lines.push(
        lanes.dashed[from]
          ? { from, to, color, bottom, dashed: true }
          : { from, to, color, bottom },
      );
    }
  };

  let lane = before.indexOf(entry.hash);
  if (lane === -1) {
    lane = allocate(lanes, entry.hash);
  }
  const color = lanes.colors[lane];

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

  const [first, ...others] = entry.parents;
  lanes.hashes[lane] = first;
  lanes.dashed[lane] = entry.hash === workingTree;
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

  lanes.widest = Math.max(lanes.widest, before.length, lanes.hashes.length);

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

export class Graph {
  private readonly checkpoints: Lanes[] = [];
  private readonly entries: readonly ShownEntry[];
  private readonly checkpointEvery: number;
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
    const lanes: Lanes = {
      hashes: [],
      colors: [],
      dashed: [],
      nextColor: 0,
      widest: 0,
    };
    this.entries.forEach((entry, index) => {
      if (index % checkpointEvery === 0) {
        this.checkpoints.push(copy(lanes));
      }
      step(lanes, entry, false);
    });
    this.width = lanes.widest;
    this.workingTreeRow = step(copy(this.checkpoints[0]), this.entries[0]);
  }

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
