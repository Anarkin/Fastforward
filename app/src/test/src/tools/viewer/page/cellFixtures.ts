import type { TextWidths } from '../../../../../lib/page/textWidths';
import {
  rectBytes,
  tileBytes,
  type CellFrame,
} from '../../../../../tools/viewer/page/cellFrame';
import {
  GlyphTiles,
  type CellMetrics,
  type GlyphPainter,
  type GlyphShape,
} from '../../../../../tools/viewer/page/glyphTiles';
import type { TextLook } from '../../../../../tools/viewer/page/textCells';

export const metrics: CellMetrics = {
  advance: 7,
  rowHeight: 16,
  baseline: 12,
  spacing: 0,
  shift: 0,
  fontAt: (scale) => `${12 * scale}px monospace`,
};

export const padX = 4;

export const padY = 4;

export const tileHeight = 24;

interface Painted {
  readonly ink: string;
  readonly ground: string;
  readonly shown: string;
  readonly x: number;
  readonly width: number;
  readonly shape: GlyphShape;
}

export interface FakePainter extends GlyphPainter {
  readonly painted: Painted[];
  readonly uploaded: number[];
}

export function fakePainter(): FakePainter {
  const painted: Painted[] = [];
  const uploaded: number[] = [];
  return {
    painted,
    uploaded,
    paint: (style, shown, x, width, shape) => {
      painted.push({
        ink: style.ink,
        ground: style.ground,
        shown,
        x,
        width,
        shape,
      });
    },
    upload: (shelf) => {
      uploaded.push(shelf);
    },
  };
}

export function tilesWith(
  painter: GlyphPainter,
  size = 4096,
  now: () => number = () => 0,
): GlyphTiles {
  return new GlyphTiles(metrics, size, painter, now);
}

const wide = /[一-鿿가-힣]/;

export const widths: TextWidths = {
  char: 7,
  of: (cluster) => (wide.test(cluster) ? 14 : cluster === '\r' ? 0 : 7),
  boxed: (cluster) => (wide.test(cluster) ? 2 : undefined),
  scaled: () => undefined,
};

export const look: TextLook = {
  ground: [17, 17, 17, 1],
  muted: 'muted',
  dots: [109, 109, 109, 1],
  plain: 'plain',
  kinds: new Map([
    ['keyword', 'blue'],
    ['string', 'orange'],
  ]),
  match: { ink: 'black', ground: [255, 204, 0, 1] },
  current: { ink: 'black', ground: [255, 204, 0, 1] },
  occurrence: { ink: undefined, ground: [65, 54, 14, 1] },
  selected: [38, 79, 120, 1],
};

export interface TileSeen {
  readonly x: number;
  readonly y: number;
  readonly u: number;
  readonly v: number;
  readonly width: number;
  readonly height: number;
  readonly ground: number;
}

export function tilesIn(frame: CellFrame): TileSeen[] {
  const places = new Int16Array(frame.tiles);
  const grounds = new Uint32Array(frame.tiles);
  return Array.from({ length: frame.tileCount }, (_, tile) => {
    const at = (tile * tileBytes) / 2;
    return {
      x: places[at],
      y: places[at + 1],
      u: places[at + 2],
      v: places[at + 3],
      width: places[at + 4],
      height: places[at + 5],
      ground: grounds[(tile * tileBytes) / 4 + 3],
    };
  });
}

export interface RectSeen {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: number;
}

export function rectsIn(frame: CellFrame): RectSeen[] {
  const places = new Int16Array(frame.rects);
  const colors = new Uint32Array(frame.rects);
  return Array.from({ length: frame.rectCount }, (_, rect) => {
    const at = (rect * rectBytes) / 2;
    return {
      x: places[at],
      y: places[at + 1],
      width: places[at + 2],
      height: places[at + 3],
      color: colors[(rect * rectBytes) / 4 + 2],
    };
  });
}

export function shownAt(
  frame: CellFrame,
  painter: FakePainter,
): { readonly shown: string; readonly column: number; readonly y: number }[] {
  return tilesIn(frame).map(({ x, y, u }) => ({
    shown: painter.painted.find((each) => each.x === u)?.shown ?? '',
    column: (x + padX) / metrics.advance,
    y: y + padY,
  }));
}
