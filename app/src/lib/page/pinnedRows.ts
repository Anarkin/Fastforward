export interface RowPlacement {
  readonly start: number;
  readonly end: number;
}

function firstEndingAfter(
  placements: readonly RowPlacement[],
  offset: number,
): number {
  let low = 0;
  let high = placements.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (placements[middle].end > offset) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low === placements.length ? -1 : low;
}

export function pinnedRows(
  placements: readonly RowPlacement[],
  scrollTop: number,
  ancestorsOf: (index: number) => readonly number[],
): readonly number[] {
  let pinned: readonly number[] = [];
  for (;;) {
    const covered =
      scrollTop +
      pinned.reduce(
        (sum, index) => sum + placements[index].end - placements[index].start,
        0,
      );
    const top = firstEndingAfter(placements, covered);
    if (top === -1) {
      return pinned;
    }
    const ancestors = ancestorsOf(top);
    const outside = pinned.findIndex((row, depth) => ancestors[depth] !== row);
    if (outside !== -1) {
      return pinned.slice(0, outside);
    }
    const next = ancestors.at(pinned.length);
    if (next === undefined || placements[next].start >= covered) {
      return pinned;
    }
    pinned = [...pinned, next];
  }
}
