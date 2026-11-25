import type { CellSurface } from '../../../components/cells/page/cellSurface';
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

const rectFields = 5;

const tileFields = 6;

export function replay(
  row: RecordedRow,
  frame: CellSurface['frame'],
  originPixels: number,
  tileHeight: number,
  bars: Shape[],
  texts: SeenText[],
): void {
  const { rects, tiles } = row;
  for (let at = 0; at < rects.length; at += rectFields) {
    frame.rect(
      rects[at] ?? 0,
      (rects[at + 1] ?? 0) - originPixels,
      rects[at + 2] ?? 0,
      rects[at + 3] ?? 0,
      rects[at + 4] ?? 0,
    );
  }
  for (let at = 0; at < tiles.length; at += tileFields) {
    frame.tile(
      tiles[at] ?? 0,
      (tiles[at + 1] ?? 0) - originPixels,
      tiles[at + 2] ?? 0,
      tiles[at + 3] ?? 0,
      tiles[at + 4] ?? 0,
      tileHeight,
      tiles[at + 5] ?? 0,
    );
  }
  for (const bar of row.bars) {
    bars.push({ ...bar, y: bar.y - originPixels });
  }
  texts.push(...row.texts);
}
