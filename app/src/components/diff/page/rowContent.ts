import { memo } from 'react';
import type { DiffRow } from './rows';

interface RowInput {
  readonly row: DiffRow;
  readonly index: number;
  readonly top: number;
  readonly inputs: readonly unknown[];
  readonly render: (
    row: DiffRow,
    index: number,
    top: number,
  ) => React.ReactNode;
}

export function sameRowInput(before: RowInput, after: RowInput): boolean {
  return (
    before.row === after.row &&
    before.index === after.index &&
    before.top === after.top &&
    before.inputs.length === after.inputs.length &&
    before.inputs.every((input, at) => Object.is(input, after.inputs[at]))
  );
}

export const RowContent = memo(function RowContent({
  row,
  index,
  top,
  render,
}: RowInput) {
  return render(row, index, top);
}, sameRowInput);

export function rowsRoom(dragged: boolean, viewHeight: number): number {
  return dragged ? 0 : viewHeight;
}

export function rowsAround(
  {
    startIndex,
    endIndex,
    count,
  }: {
    readonly startIndex: number;
    readonly endIndex: number;
    readonly count: number;
  },
  heightOf: (index: number) => number,
  room: number,
): number[] {
  if (count === 0) {
    return [];
  }
  let start = startIndex;
  for (let above = 0; start > 0 && (above < room || start === startIndex);) {
    start--;
    above += heightOf(start);
  }
  let end = endIndex;
  for (let below = 0; end < count - 1 && (below < room || end === endIndex);) {
    end++;
    below += heightOf(end);
  }
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
