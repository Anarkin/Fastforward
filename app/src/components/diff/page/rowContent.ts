import { memo } from 'react';
import type { DiffRow } from './rows';

interface RowInput {
  readonly row: DiffRow;
  readonly index: number;
  readonly inputs: readonly unknown[];
  readonly render: (row: DiffRow, index: number) => React.ReactNode;
}

export function sameRowInput(before: RowInput, after: RowInput): boolean {
  return (
    before.row === after.row &&
    before.index === after.index &&
    before.inputs.length === after.inputs.length &&
    before.inputs.every((input, at) => Object.is(input, after.inputs[at]))
  );
}

export const RowContent = memo(function RowContent({
  row,
  index,
  render,
}: RowInput) {
  return render(row, index);
}, sameRowInput);

const overscan = 30;

export function rowOverscan(dragged: boolean): number {
  return dragged ? 1 : overscan;
}
