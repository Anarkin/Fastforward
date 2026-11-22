import type { DiffRow } from './rows';

export interface FillerRun {
  readonly side: number;
  readonly top: number;
  readonly height: number;
}

interface Placed {
  readonly index: number;
  readonly start: number;
  readonly size: number;
}

function emptySideOf(row: DiffRow | undefined): number | undefined {
  if (row?.kind !== 'split') {
    return undefined;
  }
  return row.left === undefined ? 0 : row.right === undefined ? 1 : undefined;
}

export function fillerRuns(
  rows: readonly DiffRow[],
  items: readonly Placed[],
): FillerRun[] {
  const runs: FillerRun[] = [];
  let last: Placed | undefined;
  for (const item of items) {
    const side = emptySideOf(rows[item.index]);
    const run = runs.at(-1);
    if (side === undefined) {
      last = undefined;
      continue;
    }
    if (
      run !== undefined &&
      last !== undefined &&
      run.side === side &&
      last.index + 1 === item.index
    ) {
      runs[runs.length - 1] = {
        ...run,
        height: item.start + item.size - run.top,
      };
    } else {
      runs.push({ side, top: item.start, height: item.size });
    }
    last = item;
  }
  return runs;
}
