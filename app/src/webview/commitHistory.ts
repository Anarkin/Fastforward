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
  private readonly refCounts: ReadonlyMap<number, number>;
  private readonly listeners = new Set<() => void>();
  private version = 0;

  constructor(
    readonly total: number,
    decorations: readonly (readonly [number, number])[] = [],
    readonly workingTreeGraph?: GraphRow,
    readonly generation = 0,
    readonly selectedIndex?: number,
    readonly keysFrom?: number,
  ) {
    this.refCounts = new Map(decorations);
  }

  refCountAt(position: number): number {
    return this.refCounts.get(position) ?? 0;
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

  release(start: number): void {
    this.requested.delete(start);
  }

  takeMissingPages(first: number, last: number): number[] {
    const pages: number[] = [];
    const end = Math.min(last, this.total - 1);
    for (
      let start = Math.max(0, pageStart(first));
      start <= end;
      start += commitPageSize
    ) {
      if (!this.requested.has(start)) {
        this.requested.add(start);
        pages.push(start);
      }
    }
    return pages;
  }
}
