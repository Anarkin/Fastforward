import {
  commitPageSize,
  commitPagesAsked,
  pageStart,
  type CommitInfo,
  type CrowdedCommit,
  type GraphRow,
} from '../shared/protocol';

const loadedFlag = 1;
const crowdedFlag = 2;
const bubblesFlag = 4;

function crowdedPlaces(
  crowded: readonly CrowdedCommit[],
): ReadonlyMap<number, CrowdedCommit> {
  return new Map(crowded.map((commit) => [commit.position, commit]));
}

export class CommitHistory {
  private readonly rows = new Map<number, CommitInfo>();
  private readonly graph = new Map<number, GraphRow>();
  private readonly positions = new Map<string, number>();
  private readonly requested = new Set<number>();
  private readonly flags: Uint8Array;
  private readonly listeners = new Set<() => void>();
  private version = 0;
  private crowdedAt: ReadonlyMap<number, CrowdedCommit> = new Map();
  crowdedSpots: readonly CrowdedCommit[] = [];

  constructor(
    readonly total: number,
    decorations: readonly number[] = [],
    readonly workingTreeGraph?: GraphRow,
    readonly generation = 0,
    readonly selectedIndex?: number,
    readonly keysFrom?: number,
    public crowded: readonly CrowdedCommit[] = [],
  ) {
    this.flags = new Uint8Array(total);
    for (const position of decorations) {
      this.flag(position, bubblesFlag, true);
    }
    this.crowdedAt = crowdedPlaces(crowded);
    this.crowdedSpots = crowded;
    this.flagCrowded(crowded, true);
  }

  private flag(position: number, flag: number, on: boolean): void {
    if (position >= 0 && position < this.total) {
      this.flags[position] = on
        ? (this.flags[position] ?? 0) | flag
        : (this.flags[position] ?? 0) & ~flag;
    }
  }

  private flagCrowded(crowded: readonly CrowdedCommit[], on: boolean): void {
    for (const { position } of crowded) {
      this.flag(position, crowdedFlag, on);
    }
  }

  private flagged(position: number, flag: number): boolean {
    return ((this.flags[position] ?? 0) & flag) !== 0;
  }

  hasBubbles(position: number): boolean {
    return this.flagged(position, bubblesFlag);
  }

  isCrowded(position: number): boolean {
    return this.flagged(position, crowdedFlag);
  }

  keyAt(position: number): string | undefined {
    const flags = this.flags[position] ?? 0;
    if ((flags & loadedFlag) !== 0) {
      return this.rows.get(position)?.hash;
    }
    return (flags & crowdedFlag) !== 0
      ? this.crowdedAt.get(position)?.hash
      : undefined;
  }

  takeCrowded(crowded: readonly CrowdedCommit[]): void {
    const placed =
      crowded.length === this.crowded.length &&
      crowded.every(
        (commit, at) =>
          commit.position === this.crowded[at]?.position &&
          commit.hash === this.crowded[at]?.hash,
      );
    if (!placed) {
      this.crowdedSpots = crowded;
    }
    this.flagCrowded(this.crowded, false);
    this.flagCrowded(crowded, true);
    this.crowded = crowded;
    this.crowdedAt = crowdedPlaces(crowded);
    this.changed();
  }

  crowdedLanesAt(position: number): number {
    return this.crowdedAt.get(position)?.lanes ?? 0;
  }

  at(position: number): CommitInfo | undefined {
    return this.rows.get(position);
  }

  positionOf(hash: string): number | undefined {
    return this.positions.get(hash);
  }

  locate(hash: string, position: number): void {
    this.positions.set(hash, position);
  }

  graphAt(position: number): GraphRow | undefined {
    return this.graph.get(position);
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getVersion = (): number => this.version;

  holdsAll(): boolean {
    return this.rows.size === this.total;
  }

  add(
    start: number,
    commits: readonly CommitInfo[],
    graph: readonly GraphRow[] = [],
  ): void {
    for (
      let page = pageStart(start);
      page < start + commits.length;
      page += commitPageSize
    ) {
      this.requested.add(page);
    }
    commits.forEach((commit, offset) => {
      this.rows.set(start + offset, commit);
      this.positions.set(commit.hash, start + offset);
      this.flag(start + offset, loadedFlag, true);
    });
    graph.forEach((row, offset) => this.graph.set(start + offset, row));
    this.changed();
  }

  private changed(): void {
    this.version++;
    queueMicrotask(() => {
      for (const listener of this.listeners) {
        listener();
      }
    });
  }

  release(start: number, count: number): void {
    for (let page = start; page < start + count; page += commitPageSize) {
      this.requested.delete(page);
    }
  }

  takeMissingRuns(first: number, last: number): PageRun[] {
    const runs: PageRun[] = [];
    const end = Math.min(last + commitPageSize, this.total - 1);
    let run: { start: number; count: number } | undefined;
    for (
      let start = Math.max(0, pageStart(first - commitPageSize));
      start <= end;
      start += commitPageSize
    ) {
      if (this.requested.has(start)) {
        run = undefined;
        continue;
      }
      this.requested.add(start);
      if (run && run.count < commitPagesAsked * commitPageSize) {
        run.count += commitPageSize;
      } else {
        run = { start, count: commitPageSize };
        runs.push(run);
      }
    }
    return runs;
  }
}

interface PageRun {
  readonly start: number;
  readonly count: number;
}
