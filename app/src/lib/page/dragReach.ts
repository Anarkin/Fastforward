export const reachEvery = 50;

const mostRowsAStep = 5;

const mostColumnsAStep = 10;

const pastEdges = (at: number, from: number, to: number): number =>
  at < from ? at - from : at > to ? at - to : 0;

const stepsPast = (past: number, unit: number, most: number): number =>
  past === 0 || !(unit > 0)
    ? 0
    : Math.sign(past) * Math.min(most, Math.ceil(Math.abs(past) / unit));

export const rowsReached = (
  at: number,
  from: number,
  to: number,
  row: number,
): number => stepsPast(pastEdges(at, from, to), row, mostRowsAStep);

export const columnsReached = (
  at: number,
  from: number,
  to: number,
  column: number,
): number => stepsPast(pastEdges(at, from, to), column, mostColumnsAStep);
