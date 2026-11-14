import type { NumberedLine } from './diff';
import type { DiffRow } from './diffRows';

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
