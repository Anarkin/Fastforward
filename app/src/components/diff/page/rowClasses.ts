import type { NumberedLine } from './changeBlocks';
import type { DiffRow } from './rows';

export function diffRowClass(kind: DiffRow['kind']): string {
  const extra =
    kind === 'split'
      ? 'split-row'
      : kind === 'image'
        ? 'preview-row'
        : kind === 'error'
          ? 'error-row'
          : '';
  return `virtual-row diff-row ${extra}`;
}

export function splitSideClass(
  cell: NumberedLine | undefined,
  change: 'added' | 'removed',
): string {
  if (cell === undefined) {
    return 'filler';
  }
  return cell.line.kind === change ? change : '';
}

export function stripedFrom(row: DiffRow, start: number): number {
  return row.kind === 'image' ||
    (row.kind === 'split' &&
      (row.left === undefined || row.right === undefined))
    ? start
    : 0;
}
