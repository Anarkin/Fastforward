import type { CommitInfo, GraphRow } from '../protocol';

// The size of the pages the webview asks the extension for
export const commitPageSize = 100;

// A sparse view of the history: its size is known up front, so the list has
// its full height at once, and commits are filled in page by page as they
// scroll into view
export class CommitHistory {
  private readonly rows = new Map<number, CommitInfo>();
  private readonly graph = new Map<number, GraphRow>();
  private readonly positions = new Map<string, number>();
  private readonly requested = new Set<number>();
  private readonly refCounts: ReadonlyMap<number, number>;

  constructor(
    readonly total: number,
    decorations: readonly (readonly [number, number])[] = [],
    // The most lanes any row of the graph uses
    readonly graphWidth = 0,
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

  add(
    start: number,
    commits: readonly CommitInfo[],
    graph: readonly GraphRow[] = [],
  ): void {
    this.requested.add(start - (start % commitPageSize));
    commits.forEach((commit, offset) => {
      this.rows.set(start + offset, commit);
      this.positions.set(commit.hash, start + offset);
    });
    graph.forEach((row, offset) => this.graph.set(start + offset, row));
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
