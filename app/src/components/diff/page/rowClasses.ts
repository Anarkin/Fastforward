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

export function stripedFrom(row: DiffRow, start: number): number {
  return row.kind === 'image' ||
    (row.kind === 'split' &&
      (row.left === undefined || row.right === undefined))
    ? start
    : 0;
}
