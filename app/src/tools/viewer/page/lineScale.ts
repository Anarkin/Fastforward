import { rowBytes, wholeLineBytes } from '../shared/protocol';

export interface LineScale {
  readonly starts: readonly number[];
  readonly size: number;
  readonly above: Float64Array;
}

export const rowsOfLine =
  (wrapAt: number | undefined, unit: number) =>
  (bytes: number): number => {
    if (wrapAt === undefined) {
      return bytes > wholeLineBytes ? Math.ceil(bytes / rowBytes) : 1;
    }
    return Math.max(1, Math.ceil(bytes / unit / wrapAt));
  };

export function lineScaleOf(
  starts: readonly number[],
  size: number,
  rowsOf: (bytes: number) => number,
): LineScale {
  const above = new Float64Array(starts.length + 1);
  for (const [index, start] of starts.entries()) {
    const end = starts[index + 1] ?? size;
    above[index + 1] = (above[index] ?? 0) + rowsOf(end - start);
  }
  return { starts, size, above };
}

function lineWithByte(starts: readonly number[], byte: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((starts[middle] ?? Infinity) <= byte) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

function lineWithRows(above: Float64Array, rows: number): number {
  let low = 0;
  let high = above.length - 2;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((above[middle] ?? Infinity) <= rows) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

export function rowsAt(
  { starts, size, above }: LineScale,
  byte: number,
): number {
  const line = lineWithByte(starts, byte);
  const start = starts[line] ?? 0;
  const end = starts[line + 1] ?? size;
  const before = above[line] ?? 0;
  const after = above[line + 1] ?? before;
  if (byte <= start || end <= start) {
    return before;
  }
  return (
    before + (after - before) * Math.min(1, (byte - start) / (end - start))
  );
}

export function byteAtRows(
  { starts, size, above }: LineScale,
  rows: number,
): number {
  const total = above[above.length - 1] ?? 0;
  if (rows >= total) {
    return size;
  }
  const line = lineWithRows(above, Math.max(0, rows));
  const start = starts[line] ?? 0;
  const end = starts[line + 1] ?? size;
  const before = above[line] ?? 0;
  const after = above[line + 1] ?? before;
  const share =
    after > before ? (Math.max(0, rows) - before) / (after - before) : 0;
  return start + share * (end - start);
}
