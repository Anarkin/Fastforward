export interface Lanes {
  readonly keys: (number | undefined)[];
  readonly colors: number[];
  readonly dashed: boolean[];
  nextColor: number;
}

export const workingTree = -1;

export function noLanes(): Lanes {
  return { keys: [], colors: [], dashed: [], nextColor: 0 };
}

const emptyLane = -0x80000000;

export interface Checkpoint {
  readonly keys: Int32Array;
  readonly colors: Int32Array;
  readonly dashed: Uint8Array;
  readonly nextColor: number;
}

export class LaneWalk {
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
  ): number {
    const lanesAbove = this.lanes.keys.length;
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
    return Math.max(lanesAbove, lane + 1, keys.length);
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
