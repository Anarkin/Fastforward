import { graphColors, maxLanes, type GraphRow } from '../shared/protocol';

export const laneWidth = 12;

const colors = [
  'var(--color-git-graph-blue)',
  'var(--color-git-graph-green)',
  'var(--color-git-graph-orange)',
  'var(--color-git-graph-purple)',
  'var(--color-git-graph-red)',
  'var(--color-git-graph-yellow)',
  'var(--color-git-graph-cyan)',
  'var(--color-git-graph-magenta)',
];

export const margin = 3;

export function graphWidth(lanes: number): number {
  return Math.max(1, Math.min(lanes, maxLanes)) * laneWidth + 2 * margin;
}

export function color(index: number): string {
  return colors[index % graphColors];
}

export function rowLanes(row: GraphRow | undefined): number {
  if (!row) {
    return 1;
  }
  let lanes = row.lane + 1;
  for (const line of row.lines) {
    lanes = Math.max(lanes, line.from + 1, line.to + 1);
  }
  return lanes;
}
