import { maxLanes, type GraphLine, type GraphRow } from '../shared/protocol';
import { laneWidth, margin } from './graphLanes';

export interface GraphRowPlace {
  readonly row: GraphRow;
  readonly top: number;
  readonly height: number;
}

interface ShapeRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: number;
}

interface ShapeHole {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

interface ShapeCurve {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly width: number;
  readonly color: number;
  readonly dashed: boolean;
  readonly hole?: ShapeHole;
}

interface ShapeDisc {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: number;
}

interface ShapeRing {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly width: number;
  readonly color: number;
}

export interface GraphShapes {
  readonly rects: readonly ShapeRect[];
  readonly curves: readonly ShapeCurve[];
  readonly discs: readonly ShapeDisc[];
  readonly rings: readonly ShapeRing[];
}

export interface Dashes {
  readonly dash: number;
  readonly gap: number;
}

const laneLine = 2;

const dotRadius = 4;

const groundEdge = 0.75;

const innerDotRadius = 1.5;

const dash = 2;

const dashGap = 3;

const ringSteps: readonly (readonly [number, number])[] = [
  [50, 6],
  [10, 5.5],
  [5, 5],
  [2, 4.5],
];

export function lineDevicePixels(scale: number): number {
  return Math.max(1, Math.round(laneLine * scale - 1e-6));
}

export function dashesOf(scale: number): Dashes {
  return {
    dash: Math.max(1, Math.round(dash * scale)),
    gap: Math.max(1, Math.round(dashGap * scale)),
  };
}

export function laneMiddle(lane: number, scale: number): number {
  const middle =
    (margin + Math.min(lane, maxLanes - 1) * laneWidth + laneWidth / 2) * scale;
  return lineDevicePixels(scale) % 2 === 0
    ? Math.round(middle)
    : Math.floor(middle) + 0.5;
}

function ringRadius(row: GraphRow): number {
  if (row.merge !== 'collapsed') {
    return dotRadius;
  }
  const hidden = row.hidden ?? 0;
  return ringSteps.find(([least]) => hidden >= least)?.[1] ?? 3.5;
}

function holeRadius(row: GraphRow, scale: number): number {
  if (row.merge !== undefined) {
    return ringRadius(row) * scale + lineDevicePixels(scale) / 2;
  }
  return (dotRadius + groundEdge) * scale;
}

class Drawn {
  readonly rects: ShapeRect[] = [];
  readonly curves: ShapeCurve[] = [];
  readonly discs: ShapeDisc[] = [];
  readonly rings: ShapeRing[] = [];

  constructor(
    private readonly scale: number,
    private readonly origin: number,
  ) {}

  upright(
    lane: number,
    from: number,
    to: number,
    color: number,
    dashed: boolean,
  ): void {
    const top = Math.round(from);
    const bottom = Math.round(to);
    if (bottom <= top) {
      return;
    }
    const width = lineDevicePixels(this.scale);
    const x = laneMiddle(lane, this.scale) - width / 2;
    if (!dashed) {
      this.rects.push({ x, y: top, width, height: bottom - top, color });
      return;
    }
    const { dash: length, gap } = dashesOf(this.scale);
    const period = length + gap;
    const first = Math.floor((top + this.origin) / period);
    for (let at = first * period - this.origin; at < bottom; at += period) {
      const start = Math.max(top, at);
      const end = Math.min(bottom, at + length);
      if (end > start) {
        this.rects.push({ x, y: start, width, height: end - start, color });
      }
    }
  }
}

function touches(line: GraphLine, row: GraphRow): boolean {
  return line.bottom ? line.from === row.lane : line.to === row.lane;
}

function rowShapes(
  drawn: Drawn,
  { row, top, height }: GraphRowPlace,
  line: number,
  scale: number,
): void {
  const rowTop = top * scale;
  const rowBottom = (top + height) * scale;
  const dotY = rowTop + (line * scale) / 2;
  const turn = line * scale;
  const hole = holeRadius(row, scale);
  const cx = laneMiddle(row.lane, scale);
  const width = lineDevicePixels(scale);
  for (const graphLine of row.lines) {
    const { from, to, color } = graphLine;
    const dashed = graphLine.dashed === true;
    const atDot = touches(graphLine, row);
    if (!graphLine.bottom) {
      if (from === to) {
        drawn.upright(from, rowTop, atDot ? dotY - hole : dotY, color, dashed);
      } else {
        drawn.curves.push({
          fromX: laneMiddle(from, scale),
          fromY: rowTop,
          toX: laneMiddle(to, scale),
          toY: dotY,
          width,
          color,
          dashed,
          ...(atDot && { hole: { x: cx, y: dotY, radius: hole } }),
        });
      }
      continue;
    }
    if (from === to) {
      drawn.upright(from, atDot ? dotY + hole : dotY, rowBottom, color, dashed);
      continue;
    }
    drawn.curves.push({
      fromX: laneMiddle(from, scale),
      fromY: dotY,
      toX: laneMiddle(to, scale),
      toY: dotY + turn,
      width,
      color,
      dashed,
      ...(atDot && { hole: { x: cx, y: dotY, radius: hole } }),
    });
    drawn.upright(to, dotY + turn, rowBottom, color, dashed);
  }
  if (row.workingTree === true || row.stash === true) {
    const side = Math.round(2 * (dotRadius - groundEdge) * scale);
    drawn.rects.push({
      x: Math.round(cx - side / 2),
      y: Math.round(dotY - side / 2),
      width: side,
      height: side,
      color: row.color,
    });
  } else if (row.merge !== undefined) {
    drawn.rings.push({
      x: cx,
      y: dotY,
      radius: ringRadius(row) * scale,
      width,
      color: row.color,
    });
    if (row.merge === 'expanded') {
      drawn.discs.push({
        x: cx,
        y: dotY,
        radius: innerDotRadius * scale,
        color: row.color,
      });
    }
  } else {
    drawn.discs.push({
      x: cx,
      y: dotY,
      radius: (dotRadius - groundEdge) * scale,
      color: row.color,
    });
  }
}

export function graphShapes(
  rows: readonly GraphRowPlace[],
  origin: number,
  line: number,
  scale: number,
): GraphShapes {
  const originPixels = Math.round(origin * scale);
  const drawn = new Drawn(scale, originPixels);
  for (const place of rows) {
    rowShapes(
      drawn,
      { ...place, top: place.top - originPixels / scale },
      line,
      scale,
    );
  }
  return drawn;
}
