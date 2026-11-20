import { graphWidth } from './graphLanes';

export const rowIndent = 8;

export function indentOf(lanes: number): number {
  return graphWidth(lanes) + rowIndent;
}

const keptLines = new Map<string, readonly number[]>();

function kept(lines: number[]): readonly number[] {
  const key = lines.join(',');
  const known = keptLines.get(key);
  if (known !== undefined) {
    return known;
  }
  keptLines.set(key, lines);
  return lines;
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

export function sameRows(
  a: ReadonlyMap<number, readonly number[]>,
  b: ReadonlyMap<number, readonly number[]>,
): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const [position, lines] of a) {
    if (b.get(position) !== lines) {
      return false;
    }
  }
  return true;
}

export interface CrowdedLooks {
  readonly position: number;
  readonly keys: readonly string[];
}

export interface MeasuredCrowd {
  readonly position: number;
  readonly indent: number;
  readonly advances: readonly number[];
}

export function measuredCrowds(
  crowded: readonly CrowdedLooks[],
  advances: ReadonlyMap<string, number>,
  lanesAt: (position: number) => number,
): MeasuredCrowd[] {
  const measured: MeasuredCrowd[] = [];
  for (const { position, keys } of crowded) {
    const known = keys.map((key) => advances.get(key));
    if (known.every((advance) => advance !== undefined)) {
      measured.push({
        position,
        indent: indentOf(lanesAt(position)),
        advances: known,
      });
    }
  }
  return measured;
}

export function bubbleRowsAt(
  crowds: readonly MeasuredCrowd[],
  width: number,
): Map<number, readonly number[]> {
  const rows = new Map<number, readonly number[]>();
  if (width <= 0) {
    return rows;
  }
  for (const { position, indent, advances } of crowds) {
    rows.set(position, kept(bubbleLines(advances, width - indent)));
  }
  return rows;
}
