import {
  graphColors,
  maxLanes,
  type GraphLine,
  type GraphRow,
} from '../shared/protocol';
import {
  LaneWalk,
  noLanes,
  workingTree,
  type Checkpoint,
  type Lanes,
} from './laneWalk';

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

const lineKinds = maxLanes * maxLanes * graphColors * 4;
const lineStep = new Float64Array(lineKinds);
const lineOrder = new Int32Array(lineKinds);
const lineColor = new Float64Array(lineKinds);
let steps = 0;

function lineOf(key: number): GraphLine {
  const dashed = (key & 1) === 1;
  const bottom = (key & 2) === 2;
  const across = Math.floor(key / 4 / graphColors);
  const from = Math.floor(across / maxLanes);
  const to = across % maxLanes;
  const color = lineColor[key];
  return dashed
    ? { from, to, color, bottom, dashed: true }
    : { from, to, color, bottom };
}

function step(
  lanes: Lanes,
  entry: GraphEntry,
  stashes: ReadonlySet<number>,
): GraphRow {
  const current = ++steps;
  const drawn: number[] = [];
  let order = 0;
  const line = (
    lane: number,
    toLane: number,
    color: number,
    bottom: boolean,
  ) => {
    const from = Math.min(lane, maxLanes - 1);
    const to = Math.min(toLane, maxLanes - 1);
    const key =
      ((from * maxLanes + to) * graphColors + (color % graphColors)) * 4 +
      (bottom ? 2 : 0) +
      (lanes.dashed[lane] ? 1 : 0);
    if (lineStep[key] !== current) {
      lineStep[key] = current;
      drawn.push(key);
    }
    lineOrder[key] = order++;
    lineColor[key] = color;
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
  const lines = drawn
    .toSorted((a, b) => lineOrder[a] - lineOrder[b])
    .map(lineOf);
  return entry.key === workingTree
    ? { lane, color, lines, workingTree: true }
    : {
        lane,
        color,
        lines,
        merge: entry.merge,
        hidden: entry.hidden,
        stash: stash || undefined,
      };
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

  walkAhead(shown: () => boolean, sliceTime = 10): Promise<void> {
    return this.walkTo(Infinity, shown, sliceTime);
  }

  async walkTo(
    start: number,
    shown: () => boolean,
    sliceTime = 10,
  ): Promise<void> {
    const end = Math.min(start + 2, this.source.length + 1);
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
