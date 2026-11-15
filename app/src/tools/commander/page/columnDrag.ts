import { maxColumnWidth } from '../shared/columnWidths';

export function draggedWidth(
  start: number,
  advance: number,
  widened: number,
): number {
  return Math.min(
    maxColumnWidth,
    Math.max(1, Math.round(start + widened / advance)),
  );
}
