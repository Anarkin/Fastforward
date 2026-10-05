import {
  graphColors,
  maxLanes,
  type GraphLine,
  type GraphRow,
} from '../shared/protocol';

const laneWidth = 12;
const dotY = 15;
const dotRadius = 4;
const turn = 20;

const colors = [
  'var(--color-chart-blue)',
  'var(--color-chart-green)',
  'var(--color-chart-orange)',
  'var(--color-chart-purple)',
  'var(--color-chart-red)',
  'var(--color-chart-yellow)',
  'var(--color-chart-cyan)',
  'var(--color-chart-magenta)',
];

const margin = 3;

export function graphWidth(lanes: number): number {
  return Math.max(1, Math.min(lanes, maxLanes)) * laneWidth + 2 * margin;
}

function x(lane: number): number {
  return margin + Math.min(lane, maxLanes - 1) * laneWidth + laneWidth / 2;
}

function color(index: number): string {
  return colors[index % graphColors];
}

function path(line: GraphLine, height: number): string {
  const from = x(line.from);
  const to = x(line.to);
  if (!line.bottom) {
    return from === to
      ? `M ${from} 0 V ${dotY}`
      : `M ${from} 0 C ${from} ${dotY / 2} ${to} ${dotY / 2} ${to} ${dotY}`;
  }
  return from === to
    ? `M ${from} ${dotY} V ${height}`
    : `M ${from} ${dotY} C ${from} ${dotY + turn / 2} ${to} ${dotY + turn / 2} ${to} ${dotY + turn} V ${height}`;
}

export function GraphCell({
  row,
  height,
  onToggleMerge,
}: {
  row: GraphRow;
  height: number;
  onToggleMerge: () => void;
}) {
  const cx = x(row.lane);
  const laneColor = color(row.color);
  return (
    <svg className="graph" width={graphWidth(rowLanes(row))} height={height}>
      {row.lines.map((line) => {
        const d = path(line, height);
        const stroke = color(line.color);
        return (
          <path
            key={`${d} ${stroke} ${line.dashed ?? false}`}
            d={d}
            stroke={stroke}
            strokeWidth={2}
            strokeDasharray={line.dashed ? '2 3' : undefined}
            fill="none"
          />
        );
      })}
      {row.workingTree ? (
        <rect
          x={cx - dotRadius}
          y={dotY - dotRadius}
          width={2 * dotRadius}
          height={2 * dotRadius}
          fill={laneColor}
          stroke="var(--color-panel-background)"
          strokeWidth={1.5}
        />
      ) : row.merge ? (
        <g
          className="merge-dot"
          onClick={(event) => {
            event.stopPropagation();
            onToggleMerge();
          }}
        >
          <title>{mergeTitle(row)}</title>
          <circle cx={cx} cy={dotY} r={dotRadius + 4} fill="transparent" />
          <circle
            cx={cx}
            cy={dotY}
            r={ringRadius(row)}
            fill="var(--color-panel-background)"
            stroke={laneColor}
            strokeWidth={2}
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
          stroke="var(--color-panel-background)"
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
}

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
    return 'Collapse merge';
  }
  const hidden = row.hidden ?? 0;
  return hidden > 0
    ? `${hidden} ${hidden === 1 ? 'commit' : 'commits'} merged, click to expand`
    : 'Expand merge';
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
