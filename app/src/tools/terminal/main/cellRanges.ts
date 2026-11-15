import type { CellPosition, CellRange } from '../shared/protocol';

export const isLine = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function cellOf(value: unknown): CellPosition | undefined {
  return typeof value === 'object' &&
    value !== null &&
    'x' in value &&
    'y' in value &&
    isLine(value.x) &&
    isLine(value.y)
    ? { x: value.x, y: value.y }
    : undefined;
}

export function cellRangeOf(value: unknown): CellRange | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const start = 'start' in value ? cellOf(value.start) : undefined;
  const end = 'end' in value ? cellOf(value.end) : undefined;
  return start === undefined || end === undefined ? undefined : { start, end };
}
