import {
  commitPageSize,
  pageStart,
  type CommitInfo,
  type GraphRow,
} from '../shared/protocol';

export class CommitHistory {
  private readonly rows = new Map<number, CommitInfo>();
  private readonly graph = new Map<number, GraphRow>();
  private readonly positions = new Map<string, number>();
  private readonly requested = new Set<number>();
  private readonly decorated: ReadonlySet<number>;
  private readonly listeners = new Set<() => void>();
  private version = 0;

  constructor(
    readonly total: number,
    decorations: readonly number[] = [],
    readonly workingTreeGraph?: GraphRow,
    readonly generation = 0,
    readonly selectedIndex?: number,
    readonly keysFrom?: number,
  ) {
    this.decorated = new Set(decorations);
  }

  hasBubbles(position: number): boolean {
    return this.decorated.has(position);
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
    });
    graph.forEach((row, offset) => this.graph.set(start + offset, row));
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
      if (run && run.count < pagesAtOnce * commitPageSize) {
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

const pagesAtOnce = 4;
