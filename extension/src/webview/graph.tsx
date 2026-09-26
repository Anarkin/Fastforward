import type { GraphLine, GraphRow } from '../protocol';

export const laneWidth = 12;
// Lanes past this are drawn at the last one, so the graph doesn't push the
// commit text away; large repositories can have a hundred lanes at once
export const maxLanes = 12;
// Level with the middle of the subject line
const dotY = 15;
const dotRadius = 4;
// How far below the dot a line to another lane has curved into it
const turn = 20;

// Theme colors, so the lanes fit light and dark themes
const colors = [
  'var(--vscode-charts-blue)',
  'var(--vscode-charts-green)',
  'var(--vscode-charts-orange)',
  'var(--vscode-charts-purple)',
  'var(--vscode-charts-red)',
  'var(--vscode-charts-yellow)',
  'var(--vscode-terminal-ansiCyan)',
  'var(--vscode-terminal-ansiMagenta)',
];

// Room on both sides of the lanes, so the largest ring, which reaches past
// half a lane with its stroke, isn't cut off at the edges
const margin = 3;

export function graphWidth(lanes: number): number {
  return Math.max(1, Math.min(lanes, maxLanes)) * laneWidth + 2 * margin;
}

function x(lane: number): number {
  return margin + Math.min(lane, maxLanes - 1) * laneWidth + laneWidth / 2;
}

function color(index: number): string {
  return colors[index % colors.length];
}

function path(line: GraphLine, height: number): string {
  const from = x(line.from);
  const to = x(line.to);
  if (!line.bottom) {
    // From the row above into the dot
    return from === to
      ? `M ${from} 0 V ${dotY}`
      : `M ${from} 0 C ${from} ${dotY / 2} ${to} ${dotY / 2} ${to} ${dotY}`;
  }
  // From the dot to the row below, curving right away on tall rows
  return from === to
    ? `M ${from} ${dotY} V ${height}`
    : `M ${from} ${dotY} C ${from} ${dotY + turn / 2} ${to} ${dotY + turn / 2} ${to} ${dotY + turn} V ${height}`;
}

// The graph within one commit row, as tall as the row, so its lines join the
// rows above and below
export function GraphCell({
  row,
  height,
  onToggleMerge,
}: {
  row: GraphRow;
  height: number;
  onToggleMerge: () => void;
}) {
  return (
    <svg className="graph" width={graphWidth(rowLanes(row))} height={height}>
      {row.lines.map((line, index) => (
        <path
          key={index}
          d={path(line, height)}
          stroke={color(line.color)}
          strokeWidth={2}
          fill="none"
        />
      ))}
      {row.merge ? (
        // A ring, like Sublime Merge's merge commits; clicking it collapses or
        // expands what the merge brought in
        <g
          className="merge-dot"
          onClick={(event) => {
            event.stopPropagation();
            onToggleMerge();
          }}
        >
          <title>{mergeTitle(row)}</title>
          <circle
            cx={x(row.lane)}
            cy={dotY}
            r={dotRadius + 4}
            fill="transparent"
          />
          <circle
            cx={x(row.lane)}
            cy={dotY}
            r={ringRadius(row)}
            fill="var(--vscode-editor-background)"
            stroke={color(row.color)}
            strokeWidth={2}
          />
          {row.merge === 'expanded' && (
            <circle
              cx={x(row.lane)}
              cy={dotY}
              r={1.5}
              fill={color(row.color)}
            />
          )}
        </g>
      ) : (
        <circle
          cx={x(row.lane)}
          cy={dotY}
          r={dotRadius}
          fill={color(row.color)}
          stroke="var(--vscode-editor-background)"
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
}

// A collapsed merge's ring grows with the commits it hides, in steps, up to
// the width of a lane
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

// The lanes a row draws in, so its text can start right after them, like
// Sublime Merge does, instead of after the widest point of the whole graph
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
