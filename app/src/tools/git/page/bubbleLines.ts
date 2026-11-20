import { graphWidth } from './graphLanes';

export const rowIndent = 8;

export function indentOf(lanes: number): number {
  return graphWidth(lanes) + rowIndent;
}

export function bubbleLines(
  advances: readonly number[],
  width: number,
): number[] {
  const lines: number[] = [];
  let used = 0;
  for (const advance of advances) {
    if (lines.length === 0 || used + advance > width) {
      lines.push(1);
      used = advance;
    } else {
      lines[lines.length - 1] += 1;
      used += advance;
    }
  }
  return lines;
}

export function inLines<T>(
  items: readonly T[],
  lines: readonly number[],
): T[][] {
  const split: T[][] = [];
  let from = 0;
  for (const count of lines) {
    split.push(items.slice(from, from + count));
    from += count;
  }
  return split;
}

export function linesAcross(
  keys: readonly string[],
  advances: ReadonlyMap<string, number>,
  width: number,
): number[] | undefined {
  const known: number[] = [];
  for (const key of keys) {
    const advance = advances.get(key);
    if (advance === undefined) {
      return undefined;
    }
    known.push(advance);
  }
  return width > 0 ? bubbleLines(known, width) : undefined;
}

export interface CrowdedLooks {
  readonly position: number;
  readonly lanes: number;
  readonly keys: readonly string[];
}

export function bubbleRowsOf(
  crowded: readonly CrowdedLooks[],
  advances: ReadonlyMap<string, number>,
  width: number,
  lanesAt: (position: number) => number,
): Map<number, readonly number[]> {
  const rows = new Map<number, readonly number[]>();
  for (const { position, lanes, keys } of crowded) {
    const lines = linesAcross(
      keys,
      advances,
      width - indentOf(lanes > 0 ? lanes : lanesAt(position)),
    );
    if (lines !== undefined) {
      rows.set(position, lines);
    }
  }
  return rows;
}
