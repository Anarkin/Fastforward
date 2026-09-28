import { commitPageSize, type CommitInfo, type GraphRow } from '../protocol';

// A sparse view of the history: its size is known up front, so the list has
// its full height at once, and commits are filled in page by page as they
// scroll into view
export class CommitHistory {
  private readonly rows = new Map<number, CommitInfo>();
  private readonly graph = new Map<number, GraphRow>();
  private readonly positions = new Map<string, number>();
  private readonly requested = new Set<number>();
  private readonly refCounts: ReadonlyMap<number, number>;
  // The commit list re-renders itself as pages arrive, without the rest of
  // the page, through useSyncExternalStore
  private readonly listeners = new Set<() => void>();
  private version = 0;

  constructor(
    readonly total: number,
    decorations: readonly (readonly [number, number])[] = [],
    // The most lanes any row of the graph uses
    readonly graphWidth = 0,
    // The graph of the working tree's row, above the commits
    readonly workingTreeGraph?: GraphRow,
    // Which of the extension's histories this is, which its pages are asked
    // for and answered with
    readonly generation = 0,
  ) {
    this.refCounts = new Map(decorations);
  }

  // How many refs point at the commit at this position, known before the
  // commit itself is loaded
  refCountAt(position: number): number {
    return this.refCounts.get(position) ?? 0;
  }

  at(position: number): CommitInfo | undefined {
    return this.rows.get(position);
  }

  positionOf(hash: string): number | undefined {
    return this.positions.get(hash);
  }

  find(hash: string | undefined): CommitInfo | undefined {
    const position = hash === undefined ? undefined : this.positions.get(hash);
    return position === undefined ? undefined : this.rows.get(position);
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
    // Every page it covers, as a new history comes with two
    for (
      let page = start - (start % commitPageSize);
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
    // Not while React renders, as pages are added in a reducer
    queueMicrotask(() => {
      for (const listener of this.listeners) {
        listener();
      }
    });
  }

  // A page that couldn't be loaded, asked for again when the list next scrolls
  release(start: number): void {
    this.requested.delete(start);
  }

  // The starts of the pages covering first..last that haven't been asked for
  // yet, which are then counted as asked for
  takeMissingPages(first: number, last: number): number[] {
    const pages: number[] = [];
    const end = Math.min(last, this.total - 1);
    for (
      let start = Math.max(0, first - (first % commitPageSize));
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
