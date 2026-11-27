import type { CellSize, Origin, Point } from './pan';

interface Size {
  readonly width: number;
  readonly height: number;
}

export interface ZoomBase {
  readonly size: number;
  readonly ch: number;
  readonly advance: number;
  readonly ratio: number;
}

const leastAdvance = 2;

const mostTimes = 3;

const notch = 100;

export function steppedZoom(step: number, by: number, advance: number): number {
  const least = Math.max(leastAdvance, Math.ceil(advance / 2)) - advance;
  const most = mostTimes * advance - advance;
  return Math.min(most, Math.max(least, step + by));
}

export function fontSizeFor(
  step: number,
  { size, ch, advance, ratio }: ZoomBase,
): number | undefined {
  const kept = steppedZoom(step, 0, advance);
  return kept === 0 ? undefined : (size * (advance + kept)) / ratio / ch;
}

export function zoomedOrigin(
  origin: Origin,
  at: Point,
  before: Size,
  after: Size,
): Origin {
  return {
    column: Math.round(
      origin.column + at.x / before.width - at.x / after.width,
    ),
    row: Math.round(origin.row + at.y / before.height - at.y / after.height),
  };
}

export function wheelZoom(
  wheeled: number,
  step: number,
  known: {
    readonly advance: number;
    readonly origin: Origin;
    readonly cell: CellSize;
  },
  at: Point,
): {
  readonly rest: number;
  readonly zoomed?: { readonly step: number; readonly origin: Origin };
} {
  const steps = Math.trunc(wheeled / notch);
  const rest = wheeled - steps * notch;
  const next = steppedZoom(step, -steps, known.advance);
  if (next === step) {
    return { rest };
  }
  const grown = (known.advance + next) / (known.advance + step);
  return {
    rest,
    zoomed: {
      step: next,
      origin: zoomedOrigin(known.origin, at, known.cell, {
        width: known.cell.width * grown,
        height: known.cell.height * grown,
      }),
    },
  };
}
