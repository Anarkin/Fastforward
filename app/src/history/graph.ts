import {
  graphColors,
  maxLanes,
  type GraphLine,
  type GraphRow,
} from '../shared/protocol';

export interface GraphSource {
  readonly length: number;
  key(row: number): number;
  parents(row: number): readonly number[];
  merge(row: number): 'collapsed' | 'expanded' | undefined;
  hidden(row: number): number | undefined;
}

interface GraphEntry {
  readonly key: number;
  readonly parents: readonly number[];
  readonly merge?: 'collapsed' | 'expanded';
  readonly hidden?: number;
}

interface Lanes {
  readonly keys: (number | undefined)[];
  readonly colors: number[];
  readonly dashed: boolean[];
  nextColor: number;
}

function copy(lanes: Lanes): Lanes {
  return {
    keys: [...lanes.keys],
    colors: [...lanes.colors],
    dashed: [...lanes.dashed],
    nextColor: lanes.nextColor,
  };
}

const workingTree = -1;

function allocate(lanes: Lanes, key: number): number {
  let lane = lanes.keys.indexOf(undefined);
  if (lane === -1) {
    lane = lanes.keys.length;
  }
  lanes.keys[lane] = key;
  lanes.colors[lane] = lanes.nextColor++;
  lanes.dashed[lane] = false;
  return lane;
}

function step(
  lanes: Lanes,
  entry: GraphEntry,
  stashes: ReadonlySet<number>,
  drawLines = true,
): GraphRow {
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

  let lane = lanes.keys.indexOf(entry.key);
  const opened = lane === -1;
  if (opened) {
    lane = allocate(lanes, entry.key);
  }
  const color = lanes.colors[lane];

  for (let from = 0; from < lanes.keys.length; from++) {
    const key = lanes.keys[from];
    if (key === entry.key) {
      if (drawLines && !opened) {
        line(from, lane, lanes.colors[from], false);
      }
      if (from !== lane) {
        lanes.keys[from] = undefined;
      }
    } else if (drawLines && key !== undefined) {
      line(from, from, lanes.colors[from], false);
    }
  }

  const [first, ...others] = entry.parents;
  const stash = stashes.has(entry.key);
  lanes.keys[lane] = first;
  lanes.dashed[lane] = entry.key === workingTree || stash;
  const started = new Set<number>();
  for (const parent of others) {
    let to = lanes.keys.findIndex(
      (key, index) => key === parent && !lanes.dashed[index],
    );
    if (to === -1) {
      to = allocate(lanes, parent);
      started.add(to);
    }
    if (drawLines) {
      line(lane, to, lanes.colors[to], true);
    }
  }
  if (drawLines) {
    lanes.keys.forEach((key, from) => {
      if (key !== undefined && !started.has(from)) {
        line(from, from, lanes.colors[from], true);
      }
    });
  }

  while (
    lanes.keys.length > 0 &&
    lanes.keys[lanes.keys.length - 1] === undefined
  ) {
    lanes.keys.pop();
    lanes.colors.pop();
    lanes.dashed.pop();
  }
  return entry.key === workingTree
    ? { lane, color, lines: [...lines.values()], workingTree: true }
    : {
        lane,
        color,
        lines: [...lines.values()],
        merge: entry.merge,
        hidden: entry.hidden,
        stash: stash || undefined,
      };
}

function noLanes(): Lanes {
  return { keys: [], colors: [], dashed: [], nextColor: 0 };
}

function hasKey(source: GraphSource, key: number): boolean {
  for (let row = 0; row < source.length; row++) {
    if (source.key(row) === key) {
      return true;
    }
  }
  return false;
}

export class Graph {
  private readonly checkpoints: Lanes[] = [];
  private readonly checkpointEvery: number;
  private readonly lanes = noLanes();
  private reached = 0;
  private readonly stashes: ReadonlySet<number>;
  private readonly workingTreeEntry: GraphEntry;
  readonly workingTreeRow: GraphRow;

  constructor(
    private readonly source: GraphSource,
    {
      head,
      stashes = new Set(),
      checkpointEvery = 100,
      partial = false,
    }: {
      head?: number;
      stashes?: ReadonlySet<number>;
      checkpointEvery?: number;
      partial?: boolean;
    } = {},
  ) {
    const shown = head !== undefined && (partial || hasKey(source, head));
    this.workingTreeEntry = {
      key: workingTree,
      parents: shown ? [head] : [],
    };
    this.checkpointEvery = checkpointEvery;
    this.stashes = stashes;
    this.workingTreeRow = step(noLanes(), this.workingTreeEntry, stashes);
  }

  rows(start: number, count: number): GraphRow[] {
    const first = start + 1;
    const end = Math.min(first + count, this.source.length + 1);
    const checkpoint = Math.floor(first / this.checkpointEvery);
    this.layOutTo(Math.min(first + 1, this.source.length + 1));
    const from = this.checkpoints[checkpoint];
    if (!from) {
      return [];
    }
    const lanes = copy(from);
    const rows: GraphRow[] = [];
    for (let index = checkpoint * this.checkpointEvery; index < end; index++) {
      const row = step(lanes, this.entry(index), this.stashes);
      if (index >= first) {
        rows.push(row);
      }
    }
    return rows;
  }

  private entry(index: number): GraphEntry {
    if (index === 0) {
      return this.workingTreeEntry;
    }
    const row = index - 1;
    const { source } = this;
    return {
      key: source.key(row),
      parents: source.parents(row),
      merge: source.merge(row),
      hidden: source.hidden(row),
    };
  }

  private layOutTo(end: number): void {
    for (; this.reached < end; this.reached++) {
      if (this.reached % this.checkpointEvery === 0) {
        this.checkpoints.push(copy(this.lanes));
      }
      step(this.lanes, this.entry(this.reached), this.stashes, false);
    }
  }
}
