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
      if (!opened) {
        line(from, lane, lanes.colors[from], false);
      }
      if (from !== lane) {
        lanes.keys[from] = undefined;
      }
    } else if (key !== undefined) {
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
    line(lane, to, lanes.colors[to], true);
  }
  lanes.keys.forEach((key, from) => {
    if (key !== undefined && !started.has(from)) {
      line(from, from, lanes.colors[from], true);
    }
  });

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

const emptyLane = -0x80000000;

interface Checkpoint {
  readonly keys: Int32Array;
  readonly colors: Int32Array;
  readonly dashed: Uint8Array;
  readonly nextColor: number;
}

class LaneWalk {
  private readonly lanesOf = new Map<number, number[]>();
  private readonly empty: number[] = [];

  constructor(private readonly lanes: Lanes = noLanes()) {
    lanes.keys.forEach((key, lane) => {
      if (key === undefined) {
        this.pushEmpty(lane);
      } else {
        this.hold(key, lane);
      }
    });
  }

  static from(checkpoint: Checkpoint): LaneWalk {
    return new LaneWalk({
      keys: Array.from(checkpoint.keys, (key) =>
        key === emptyLane ? undefined : key,
      ),
      colors: Array.from(checkpoint.colors),
      dashed: Array.from(checkpoint.dashed, Boolean),
      nextColor: checkpoint.nextColor,
    });
  }

  get current(): Lanes {
    return this.lanes;
  }

  checkpoint(): Checkpoint {
    const { keys, colors, dashed, nextColor } = this.lanes;
    const saved = {
      keys: new Int32Array(keys.length),
      colors: new Int32Array(colors),
      dashed: new Uint8Array(dashed.length),
      nextColor,
    };
    for (let lane = 0; lane < keys.length; lane++) {
      saved.keys[lane] = keys[lane] ?? emptyLane;
      saved.dashed[lane] = dashed[lane] ? 1 : 0;
    }
    return saved;
  }

  advance(
    key: number,
    parents: readonly number[],
    stashes: ReadonlySet<number>,
  ) {
    const holding = this.lanesOf.get(key);
    let lane: number;
    if (holding && holding.length > 0) {
      lane = Math.min(...holding);
      for (const merged of holding.filter((other) => other !== lane)) {
        this.set(merged, undefined);
      }
    } else {
      lane = this.allocate(key);
    }
    const [first, ...others] = parents;
    this.set(lane, first);
    this.lanes.dashed[lane] = key === workingTree || stashes.has(key);
    for (const parent of others) {
      const found = this.lanesOf
        .get(parent)
        ?.some((other) => !this.lanes.dashed[other]);
      if (!found) {
        this.allocate(parent);
      }
    }
    const { keys, colors, dashed } = this.lanes;
    while (keys.length > 0 && keys[keys.length - 1] === undefined) {
      keys.pop();
      colors.pop();
      dashed.pop();
    }
  }

  private allocate(key: number): number {
    const { keys, colors, dashed } = this.lanes;
    let lane = this.popEmpty();
    if (lane === undefined) {
      lane = keys.length;
      keys.push(undefined);
      colors.push(0);
      dashed.push(false);
    }
    this.set(lane, key);
    colors[lane] = this.lanes.nextColor++;
    dashed[lane] = false;
    return lane;
  }

  private set(lane: number, key: number | undefined): void {
    const old = this.lanes.keys[lane];
    if (old !== undefined) {
      const holding = this.lanesOf.get(old) ?? [];
      holding.splice(holding.indexOf(lane), 1);
      if (holding.length === 0) {
        this.lanesOf.delete(old);
      }
    }
    this.lanes.keys[lane] = key;
    if (key === undefined) {
      this.pushEmpty(lane);
    } else {
      this.hold(key, lane);
    }
  }

  private hold(key: number, lane: number): void {
    const holding = this.lanesOf.get(key);
    if (holding) {
      holding.push(lane);
    } else {
      this.lanesOf.set(key, [lane]);
    }
  }

  private pushEmpty(lane: number): void {
    const { empty } = this;
    empty.push(lane);
    for (let at = empty.length - 1; at > 0;) {
      const parent = (at - 1) >> 1;
      if (empty[parent] <= empty[at]) {
        break;
      }
      [empty[parent], empty[at]] = [empty[at], empty[parent]];
      at = parent;
    }
  }

  private popEmpty(): number | undefined {
    const { empty } = this;
    const { keys } = this.lanes;
    while (empty.length > 0) {
      const lane = empty[0];
      const last = empty.pop() ?? lane;
      if (empty.length > 0) {
        empty[0] = last;
        for (let at = 0; ;) {
          const left = 2 * at + 1;
          const right = left + 1;
          let smallest = at;
          if (left < empty.length && empty[left] < empty[smallest]) {
            smallest = left;
          }
          if (right < empty.length && empty[right] < empty[smallest]) {
            smallest = right;
          }
          if (smallest === at) {
            break;
          }
          [empty[smallest], empty[at]] = [empty[at], empty[smallest]];
          at = smallest;
        }
      }
      if (lane < keys.length && keys[lane] === undefined) {
        return lane;
      }
    }
    return undefined;
  }
}

export class Graph {
  private readonly checkpoints: Checkpoint[] = [];
  private readonly checkpointEvery: number;
  private readonly walk = new LaneWalk();
  private reached = 0;
  private readonly stashes: ReadonlySet<number>;
  private readonly workingTreeEntry: GraphEntry;
  readonly workingTreeRow: GraphRow;

  constructor(
    private readonly source: GraphSource,
    {
      head,
      stashes = new Set(),
      checkpointEvery = 1000,
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
    const walk = LaneWalk.from(from);
    for (
      let index = checkpoint * this.checkpointEvery;
      index < first;
      index++
    ) {
      this.advance(walk, index);
    }
    const lanes = walk.current;
    const rows: GraphRow[] = [];
    for (let index = first; index < end; index++) {
      rows.push(step(lanes, this.entry(index), this.stashes));
    }
    return rows;
  }

  private advance(walk: LaneWalk, index: number): void {
    if (index === 0) {
      walk.advance(workingTree, this.workingTreeEntry.parents, this.stashes);
    } else {
      walk.advance(
        this.source.key(index - 1),
        this.source.parents(index - 1),
        this.stashes,
      );
    }
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

  async walkAhead(shown: () => boolean, sliceTime = 10): Promise<void> {
    const end = this.source.length + 1;
    while (this.reached < end && shown()) {
      const until = performance.now() + sliceTime;
      do {
        this.layOutTo(Math.min(this.reached + walkedAtOnce, end));
      } while (this.reached < end && performance.now() < until);
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  private layOutTo(end: number): void {
    for (; this.reached < end; this.reached++) {
      if (this.reached % this.checkpointEvery === 0) {
        this.checkpoints.push(this.walk.checkpoint());
      }
      this.advance(this.walk, this.reached);
    }
  }
}

const walkedAtOnce = 256;
