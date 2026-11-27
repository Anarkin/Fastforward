import type { Shape } from '../../../components/cells/page/shapeLayer';
import type { BubbleHit, RowHit } from './commitHits';

export interface SeenText {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

type RoundedShape = Extract<Shape, { kind: 'rounded' }>;

export interface RecordedRow {
  readonly sign: readonly unknown[];
  readonly rects: number[];
  readonly tiles: number[];
  readonly bars: RoundedShape[];
  readonly texts: SeenText[];
  readonly bubbles: BubbleHit[];
  hit: RowHit | undefined;
  animated: boolean;
}

export function recordOf(sign: readonly unknown[]): RecordedRow {
  return {
    sign,
    rects: [],
    tiles: [],
    bars: [],
    texts: [],
    bubbles: [],
    hit: undefined,
    animated: false,
  };
}

export function sameSign(
  known: readonly unknown[] | undefined,
  sign: readonly unknown[],
): boolean {
  return (
    known !== undefined &&
    known.length === sign.length &&
    known.every((part, at) => part === sign[at])
  );
}

export function barsOf(
  rows: readonly RecordedRow[],
  originPixels: number,
): Shape[] {
  return rows.flatMap((row) =>
    row.bars.map((bar) => ({ ...bar, y: bar.y - originPixels })),
  );
}
