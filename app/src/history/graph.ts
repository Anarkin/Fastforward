import {
  graphColors,
  maxLanes,
  type GraphLine,
  type GraphRow,
} from '../shared/protocol';
import type { ShownEntry } from './merges';

interface Lanes {
  readonly hashes: (string | undefined)[];
  readonly colors: number[];
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
  const lines = new Map<string, GraphLine>();
  const line = (
    lane: number,
    toLane: number,
    color: number,
    bottom: boolean,
  ) => {
    const from = Math.min(lane, maxLanes - 1);
    const to = Math.min(toLane, maxLanes - 1);
    const dashed = lanes.dashed[lane];
    const key = `${from} ${to} ${color % graphColors} ${bottom} ${dashed}`;
    lines.delete(key);
    lines.set(
      key,
      dashed
        ? { from, to, color, bottom, dashed: true }
        : { from, to, color, bottom },
    );
  };

  let lane = lanes.hashes.indexOf(entry.hash);
  const opened = lane === -1;
  if (opened) {
    lane = allocate(lanes, entry.hash);
  }
  const color = lanes.colors[lane];

  for (let from = 0; from < lanes.hashes.length; from++) {
    const hash = lanes.hashes[from];
    if (hash === entry.hash) {
      if (drawLines && !opened) {
        line(from, lane, lanes.colors[from], false);
      }
      if (from !== lane) {
        lanes.hashes[from] = undefined;
      }
    } else if (drawLines && hash !== undefined) {
      line(from, from, lanes.colors[from], false);
    }
  }

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
    if (drawLines) {
      line(lane, to, lanes.colors[to], true);
    }
  }
  if (drawLines) {
    lanes.hashes.forEach((hash, from) => {
      if (hash !== undefined && !started.has(from)) {
        line(from, from, lanes.colors[from], true);
      }
    });
  }

  while (
    lanes.hashes.length > 0 &&
    lanes.hashes[lanes.hashes.length - 1] === undefined
  ) {
    lanes.hashes.pop();
    lanes.colors.pop();
    lanes.dashed.pop();
  }
  return entry.hash === workingTree
    ? { lane, color, lines: [...lines.values()], workingTree: true }
    : {
        lane,
        color,
        lines: [...lines.values()],
        merge: entry.merge,
        hidden: entry.hidden,
      };
}

function noLanes(): Lanes {
  return { hashes: [], colors: [], dashed: [], nextColor: 0 };
}

export class Graph {
  private readonly checkpoints: Lanes[] = [];
  private readonly entries: readonly ShownEntry[];
  private readonly checkpointEvery: number;
  private readonly lanes = noLanes();
  private reached = 0;
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
    this.workingTreeRow = step(noLanes(), this.entries[0]);
  }

  rows(start: number, count: number): GraphRow[] {
    const first = start + 1;
    const end = Math.min(first + count, this.entries.length);
    const checkpoint = Math.floor(first / this.checkpointEvery);
    this.layOutTo(Math.min(first + 1, this.entries.length));
    const from = this.checkpoints[checkpoint];
    if (!from) {
      return [];
    }
    const lanes = copy(from);
    const rows: GraphRow[] = [];
    for (let index = checkpoint * this.checkpointEvery; index < end; index++) {
      const row = step(lanes, this.entries[index]);
      if (index >= first) {
        rows.push(row);
      }
    }
    return rows;
  }

  private layOutTo(end: number): void {
    for (; this.reached < end; this.reached++) {
      if (this.reached % this.checkpointEvery === 0) {
        this.checkpoints.push(copy(this.lanes));
      }
      step(this.lanes, this.entries[this.reached], false);
    }
  }
}
