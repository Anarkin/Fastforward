import type { ListMove } from './listMoves';
import { type DiffRow, isChange } from './diffRows';
import { uniformHeight, rowLines } from './rowMeasures';

export function diffScrollTop(
  move: ListMove,
  scrollTop: number,
  viewport: number,
  total: number,
  line = uniformHeight,
): number | undefined {
  const bottom = Math.max(0, total - viewport);
  let target: number;
  switch (move) {
    case 'down':
      target = scrollTop + line;
      break;
    case 'up':
      target = scrollTop - line;
      break;
    case 'pageDown':
      target = scrollTop + Math.max(line, viewport - line);
      break;
    case 'pageUp':
      target = scrollTop - Math.max(line, viewport - line);
      break;
    case 'first':
      target = 0;
      break;
    case 'last':
      target = bottom;
      break;
  }
  return Math.max(0, Math.min(bottom, target));
}

export function changeStarts(rows: readonly DiffRow[]): number[] {
  return rows.flatMap((row, index) =>
    isChange(row) && !isChange(rows[index - 1]) ? [index] : [],
  );
}

export function changeMargin(lineHeight: number): number {
  return (rowLines.file + 2) * lineHeight;
}

export function changeScrollTop(
  starts: readonly number[],
  scrollTop: number,
  step: 1 | -1,
  margin: number,
): number | undefined {
  const targets = starts.map((start) => Math.max(0, start - margin));
  const target =
    step > 0
      ? targets.find((top) => top > scrollTop + 1)
      : targets.findLast((top) => top < scrollTop - 1);
  return target;
}

export function keyedScrollTop(
  step: 1 | -1 | undefined,
  move: ListMove | undefined,
  scrolled: number,
  viewport: number,
  total: number,
  lineHeight: number,
  changeTops: () => readonly number[],
): number | undefined {
  if (step !== undefined) {
    return changeScrollTop(
      changeTops(),
      scrolled,
      step,
      changeMargin(lineHeight),
    );
  }
  return move && diffScrollTop(move, scrolled, viewport, total, lineHeight);
}

export function firstChangeTop(
  starts: readonly number[],
  margin: number,
): number | undefined {
  const [first] = starts;
  return first === undefined ? undefined : Math.max(0, first - margin);
}
