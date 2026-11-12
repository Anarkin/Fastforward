import { memo } from 'react';
import {
  graphColors,
  maxLanes,
  type GraphLine,
  type GraphRow,
} from '../shared/protocol';
import { strings } from '../../../shared/strings';

const laneWidth = 12;
const laneLine = 2;
const dotRadius = 4;
const overlap = 1;

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

const margin = 3;

export function graphWidth(lanes: number): number {
  return Math.max(1, Math.min(lanes, maxLanes)) * laneWidth + 2 * margin;
}

function devicePixelsOfLine(scale: number): number {
  return Math.max(1, Math.round(laneLine * scale - 1e-6));
}

function lineWidth(scale: number): number {
  return devicePixelsOfLine(scale) / scale;
}

function x(lane: number, scale: number): number {
  const middle =
    (margin + Math.min(lane, maxLanes - 1) * laneWidth + laneWidth / 2) * scale;
  return (
    (devicePixelsOfLine(scale) % 2 === 0
      ? Math.round(middle)
      : Math.floor(middle) + 0.5) / scale
  );
}

function color(index: number): string {
  return colors[index % graphColors];
}

function path(
  line: GraphLine,
  height: number,
  lineHeight: number,
  scale: number,
): string {
  const from = x(line.from, scale);
  const to = x(line.to, scale);
  const dotY = lineHeight / 2;
  const turn = lineHeight;
  if (!line.bottom) {
    const top = line.dashed ? 0 : -overlap;
    return from === to
      ? `M ${from} ${top} V ${dotY}`
      : `M ${from} ${top}${top < 0 ? ' V 0' : ''} C ${from} ${dotY / 2} ${to} ${dotY / 2} ${to} ${dotY}`;
  }
  return from === to
    ? `M ${from} ${dotY} V ${height}`
    : `M ${from} ${dotY} C ${from} ${dotY + turn / 2} ${to} ${dotY + turn / 2} ${to} ${dotY + turn} V ${height}`;
}

export const GraphCell = memo(function GraphCell({
  row,
  height,
  line,
  hash,
  scale = 1,
  onToggleMerge,
}: {
  row: GraphRow;
  height: number;
  line: number;
  hash?: string;
  scale?: number;
  onToggleMerge: (hash: string) => void;
}) {
  const cx = x(row.lane, scale);
  const dotY = line / 2;
  const laneColor = color(row.color);
  return (
    <svg className="graph" width={graphWidth(rowLanes(row))} height={height}>
      {row.lines.map((graphLine) => {
        const d = path(graphLine, height, line, scale);
        const stroke = color(graphLine.color);
        return (
          <path
            key={`${d} ${stroke} ${graphLine.dashed ?? false}`}
            d={d}
            stroke={stroke}
            strokeWidth={lineWidth(scale)}
            strokeDasharray={graphLine.dashed ? '2 3' : undefined}
            fill="none"
          />
        );
      })}
      {row.workingTree || row.stash ? (
        <rect
          x={cx - dotRadius}
          y={dotY - dotRadius}
          width={2 * dotRadius}
          height={2 * dotRadius}
          fill={laneColor}
          stroke="var(--graph-ground)"
          strokeWidth={1.5}
        />
      ) : row.merge ? (
        <g
          className="merge-dot"
          onClick={(event) => {
            event.stopPropagation();
            if (hash !== undefined) {
              onToggleMerge(hash);
            }
          }}
        >
          <title>{mergeTitle(row)}</title>
          <circle cx={cx} cy={dotY} r={dotRadius + 4} fill="transparent" />
          <circle
            cx={cx}
            cy={dotY}
            r={ringRadius(row)}
            fill="var(--graph-ground)"
            stroke={laneColor}
            strokeWidth={lineWidth(scale)}
          />
          {row.merge === 'expanded' && (
            <circle cx={cx} cy={dotY} r={1.5} fill={laneColor} />
          )}
        </g>
      ) : (
        <circle
          cx={cx}
          cy={dotY}
          r={dotRadius}
          fill={laneColor}
          stroke="var(--graph-ground)"
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
});

const ringSteps: readonly (readonly [number, number])[] = [
  [50, 6],
  [10, 5.5],
  [5, 5],
  [2, 4.5],
];

function ringRadius(row: GraphRow): number {
  if (row.merge !== 'collapsed') {
    return dotRadius;
  }
  const hidden = row.hidden ?? 0;
  return ringSteps.find(([least]) => hidden >= least)?.[1] ?? 3.5;
}

function mergeTitle(row: GraphRow): string {
  if (row.merge === 'expanded') {
    return strings.commits.collapseMerge;
  }
  const hidden = row.hidden ?? 0;
  return hidden > 0
    ? strings.commits.merged(hidden)
    : strings.commits.expandMerge;
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
