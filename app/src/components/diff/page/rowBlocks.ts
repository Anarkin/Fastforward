import type { FindRange } from './find';

const blockRows = 64;

export interface RowRun {
  readonly from: number;
  readonly to: number;
  readonly row: number;
  readonly rows: number;
}

export function rowBlocks(starts: readonly number[], length: number): RowRun[] {
  const blocks: RowRun[] = [];
  for (let row = 0; row < starts.length; row += blockRows) {
    const rows = Math.min(blockRows, starts.length - row);
    blocks.push({
      from: starts[row],
      to: starts.at(row + rows) ?? length,
      row,
      rows,
    });
  }
  return blocks;
}

export function drawnRuns(
  blocks: readonly RowRun[],
  drawn: ReadonlySet<number>,
): RowRun[] {
  const runs: RowRun[] = [];
  for (const index of [...drawn].toSorted((a, b) => a - b)) {
    const block = blocks.at(index);
    const last = runs.at(-1);
    if (block === undefined) {
      continue;
    }
    if (last !== undefined && last.row + last.rows === block.row) {
      runs[runs.length - 1] = {
        ...last,
        to: block.to,
        rows: last.rows + block.rows,
      };
    } else {
      runs.push(block);
    }
  }
  return runs;
}

export function blocksNear(
  blocks: readonly RowRun[],
  lineHeight: number,
  top: number,
  bottom: number,
): Set<number> {
  const near = new Set<number>();
  for (const [index, { row, rows }] of blocks.entries()) {
    if (row * lineHeight < bottom && (row + rows) * lineHeight > top) {
      near.add(index);
    }
  }
  return near;
}

export function blocksOf(
  blocks: readonly RowRun[],
  range: FindRange | undefined,
): number[] {
  if (range === undefined) {
    return [];
  }
  return blocks.flatMap(({ from, to }, index) =>
    from <= Math.max(range.start, range.end - 1) && range.start < to
      ? [index]
      : [],
  );
}
