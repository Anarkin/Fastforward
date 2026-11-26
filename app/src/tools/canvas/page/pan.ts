import { notchesOf } from '../../../lib/page/wheelTurns';
import type { Box } from './grid';

export interface Origin {
  readonly column: number;
  readonly row: number;
}

export interface CellSize {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface PanWheel {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly deltaMode: number;
  readonly wheelDeltaX?: number;
  readonly wheelDeltaY?: number;
}

const unpanned: Origin = { column: 0, row: 0 };

export function originOf(bounds: Box | undefined): Origin {
  return bounds === undefined
    ? unpanned
    : { column: bounds.column - 2, row: bounds.row - 1 };
}

export function dragged(
  start: Origin,
  from: Point,
  to: Point,
  cell: CellSize,
): Origin {
  return {
    column: start.column - (to.x - from.x) / cell.width,
    row: start.row - (to.y - from.y) / cell.height,
  };
}

export function snapped({ column, row }: Origin): Origin {
  return { column: Math.round(column), row: Math.round(row) };
}

const lineMode = 1;

const pageMode = 2;

export interface WheelMove {
  readonly by: Origin;
  readonly notched: boolean;
}

function axisMove(
  delta: number,
  wheelDelta: number | undefined,
  deltaMode: number,
  cell: number,
  view: number,
  perNotch: number,
): { readonly cells: number; readonly notched: boolean } {
  const notches = notchesOf({
    deltaY: delta,
    deltaMode,
    wheelDeltaY: wheelDelta ?? 0,
  });
  if (notches !== undefined) {
    return { cells: notches * perNotch, notched: true };
  }
  if (deltaMode === lineMode) {
    return { cells: delta, notched: true };
  }
  if (deltaMode === pageMode) {
    return { cells: Math.round((delta * view) / cell), notched: true };
  }
  return { cells: delta / cell, notched: false };
}

export function wheelMove(
  wheel: PanWheel,
  cell: CellSize,
  view: CellSize,
  perNotch: number,
  across: boolean,
): WheelMove {
  const columns = axisMove(
    across ? wheel.deltaX || wheel.deltaY : wheel.deltaX,
    across ? wheel.wheelDeltaX || wheel.wheelDeltaY : wheel.wheelDeltaX,
    wheel.deltaMode,
    cell.width,
    view.width,
    perNotch,
  );
  const rows = across
    ? { cells: 0, notched: false }
    : axisMove(
        wheel.deltaY,
        wheel.wheelDeltaY,
        wheel.deltaMode,
        cell.height,
        view.height,
        perNotch,
      );
  return {
    by: { column: columns.cells || 0, row: rows.cells || 0 },
    notched: columns.notched || rows.notched,
  };
}
