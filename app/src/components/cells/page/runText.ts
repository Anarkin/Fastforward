import { cssOf, packedOf, type Rgba } from './cellColors';
import { offsetOf, runPadding, type RunAtlas } from './runAtlas';

export const ellipsis = '…';

export interface RowPaint {
  readonly rects: number[];
  readonly tiles: number[];
}

export interface Ink {
  readonly start: number;
  readonly end: number;
  readonly ink: string;
}

export interface Range {
  readonly start: number;
  readonly end: number;
}

export interface RunLook {
  readonly ink: string;
  readonly ground: Rgba;
  readonly markInk: string;
  readonly markGround: Rgba;
  readonly markTop: number;
  readonly markHeight: number;
}

interface Strike {
  readonly rise: number;
  readonly thickness: number;
}

export interface Run {
  readonly text: string;
  readonly font: string;
  readonly x: number;
  readonly baseline: number;
  readonly inks: readonly Ink[];
  readonly marks?: readonly Range[];
  readonly strike?: Strike;
}

const noMarks: readonly Range[] = [];

function boundariesOf(
  length: number,
  inks: readonly Ink[],
  marks: readonly Range[],
): number[] {
  const cuts = new Set([0, length]);
  for (const { start, end } of [...inks, ...marks]) {
    cuts.add(Math.max(0, Math.min(length, start)));
    cuts.add(Math.max(0, Math.min(length, end)));
  }
  return [...cuts].toSorted((a, b) => a - b);
}

export function putRun(
  paint: RowPaint,
  runs: RunAtlas,
  scale: number,
  top: number,
  look: RunLook,
  { text, font, x, baseline, inks, marks = noMarks, strike }: Run,
): void {
  const cuts = boundariesOf(text.length, inks, marks);
  const topPixels = Math.round(top * scale);
  const shift = Math.round((top + baseline) * scale) - topPixels;
  for (let at = 0; at + 1 < cuts.length; at++) {
    const start = cuts[at] ?? 0;
    const end = cuts[at + 1] ?? start;
    if (end <= start) {
      continue;
    }
    const marked = marks.some((mark) => mark.start <= start && mark.end >= end);
    const ink = marked
      ? look.markInk
      : (inks.find((each) => each.start <= start && each.end > start)?.ink ??
        look.ink);
    const ground = marked ? look.markGround : look.ground;
    const piece = text.slice(start, end);
    const from =
      x * scale + (start === 0 ? 0 : runs.measure(text.slice(0, start), font));
    if (marked) {
      const markLeft = Math.round(from);
      const markTop = Math.round((top + look.markTop) * scale);
      paint.rects.push(
        markLeft,
        markTop,
        Math.round(from + runs.measure(piece, font)) - markLeft,
        Math.round((top + look.markTop + look.markHeight) * scale) - markTop,
        packedOf(look.markGround),
      );
    }
    const tile = runs.tile(
      piece,
      {
        key: `${font}|${ink}|${ground.join(',')}|${shift}|${strike !== undefined}`,
        font,
        ink,
        ground: cssOf(ground),
        baseline: shift,
        ...(strike !== undefined && {
          strike: {
            top: shift - strike.rise - strike.thickness,
            thickness: strike.thickness,
          },
        }),
      },
      offsetOf(from),
    );
    if (tile !== undefined) {
      paint.tiles.push(
        Math.floor(from) - runPadding,
        topPixels,
        tile.u,
        tile.v,
        tile.width,
        runs.tileHeight,
        packedOf(ground),
      );
    }
  }
}

export function fitted(
  atlas: RunAtlas,
  text: string,
  font: string,
  room: number,
): string {
  if (atlas.measure(text, font) <= room) {
    return text;
  }
  const characters = Array.from(text);
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    const cut = characters.slice(0, middle).join('') + ellipsis;
    if (atlas.measure(cut, font) <= room) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low === 0 ? '' : characters.slice(0, low).join('') + ellipsis;
}

let measuring: OffscreenCanvasRenderingContext2D | null | undefined;

export function ascentOf(font: string): number {
  measuring ??= new OffscreenCanvas(1, 1).getContext('2d');
  if (measuring === null) {
    return 0;
  }
  measuring.font = font;
  return Math.round(measuring.measureText('x').fontBoundingBoxAscent);
}
