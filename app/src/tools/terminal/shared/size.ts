const maxSize = 1000;

export interface TerminalSize {
  readonly columns: number;
  readonly rows: number;
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

export function sizeWithin(
  columns: unknown,
  rows: unknown,
): TerminalSize | undefined {
  return isCount(columns) && isCount(rows)
    ? { columns: Math.min(columns, maxSize), rows: Math.min(rows, maxSize) }
    : undefined;
}
