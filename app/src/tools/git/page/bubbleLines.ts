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

export interface FittedLines {
  readonly lines: readonly number[];
  readonly from: number;
  readonly until: number;
}

export function fittedLines(
  advances: readonly number[],
  room: number,
): FittedLines {
  const lines: number[] = [];
  let used = 0;
  let from = -Infinity;
  let until = Infinity;
  for (const advance of advances) {
    const reach = used + advance;
    if (lines.length === 0) {
      lines.push(1);
      used = advance;
    } else if (reach > room) {
      until = Math.min(until, reach);
      lines.push(1);
      used = advance;
    } else {
      from = Math.max(from, reach);
      lines[lines.length - 1] += 1;
      used = reach;
    }
  }
  return { lines: kept(lines), from, until };
}

export function bubbleLines(
  advances: readonly number[],
  width: number,
): readonly number[] {
  return fittedLines(advances, width).lines;
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
): readonly number[] | undefined {
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
