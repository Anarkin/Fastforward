import { blankRuns } from '../../../lib/page/rowBreaks';
import type { TextWidths } from '../../../lib/page/textWidths';
import { strings } from '../../../lib/shared/strings';
import type { TextRow } from '../shared/protocol';
import { CellFrame, type KeptCells } from './cellFrame';
import type { GlyphTiles } from './glyphTiles';
import { markPieces, type FindMark } from './markPieces';
import { marksWithin, piecesWithin, type ScreenRow } from './screenRows';
import {
  drawDot,
  drawPieces,
  drawSign,
  type DotBox,
  type DrawnPiece,
  type TextDrawing,
  type TextPalette,
} from './textCells';
import { rowSegments, type ColoredText } from './textColors';

export interface RowPart {
  readonly from: number;
  readonly to: number;
  readonly column: number;
}

export interface RowsLook {
  readonly wrapAt: number | undefined;
  readonly colored: ColoredText | undefined;
  readonly marksOf: (row: ScreenRow) => readonly FindMark[];
  readonly showWhitespace: boolean;
  readonly widths: TextWidths;
  readonly first: number;
}

export interface ShownRows extends RowsLook {
  readonly rows: readonly ScreenRow[];
  readonly parts: readonly (RowPart | undefined)[];
}

interface KeptRow {
  readonly row: TextRow;
  readonly from: number;
  readonly to: number;
  readonly column: number;
  readonly colored: ColoredText | undefined;
  readonly marks: readonly FindMark[];
  readonly blanks: boolean;
  readonly limit: number;
  readonly generation: number;
  readonly first: number;
  readonly y: number;
  readonly cells: KeptCells;
  used: number;
}

export interface CellPainting {
  readonly tiles: GlyphTiles;
  readonly frame: CellFrame;
  readonly scratch: CellFrame;
  readonly dot: DotBox;
  readonly kept: Map<string, KeptRow>;
  palette: TextPalette;
  paints: number;
}

export const cellPainting = (
  tiles: GlyphTiles,
  frame: CellFrame,
  palette: TextPalette,
  dot: DotBox,
): CellPainting => ({
  tiles,
  frame,
  scratch: new CellFrame(),
  dot,
  kept: new Map(),
  palette,
  paints: 0,
});

const keptScreens = 8;

function piecesOf(
  colored: ColoredText | undefined,
  row: ScreenRow,
  marks: readonly FindMark[],
  from: number,
  to: number,
): readonly DrawnPiece[] {
  const segments = piecesWithin(
    (colored && rowSegments(colored, row.row)) ?? [{ text: row.row.text }],
    from,
    to,
  );
  return marks.length === 0
    ? segments
    : markPieces(segments, marksWithin(marks, from, to));
}

const sameMarks = (one: readonly FindMark[], other: readonly FindMark[]) =>
  one === other || (one.length === 0 && other.length === 0);

function drawRow(
  drawing: TextDrawing,
  row: ScreenRow,
  pieces: readonly DrawnPiece[],
  column: number,
  y: number,
): void {
  drawPieces(drawing, pieces, column, y);
  if (!drawing.blanks) {
    for (const run of blankRuns(row.hanging)) {
      if (run.tab) {
        drawSign(drawing, strings.symbols.tab, run.column, y);
      } else {
        for (let at = 0; at < run.columns; at++) {
          drawDot(drawing, run.column + at, y);
        }
      }
    }
  }
  if (row.breakAt !== undefined) {
    drawSign(drawing, strings.symbols.breaks, row.breakAt, y);
  }
}

const drawingOn = (
  { tiles, palette, dot }: CellPainting,
  frame: CellFrame,
  { widths, showWhitespace, first, wrapAt }: RowsLook,
): TextDrawing => ({
  tiles,
  frame,
  palette,
  widths,
  blanks: showWhitespace,
  first,
  limit: wrapAt ?? Infinity,
  dot,
});

const rowKey = (row: ScreenRow): string => `${row.row.start}:${row.from}`;

function keptOf(
  { kept, tiles }: CellPainting,
  { colored, showWhitespace, wrapAt }: RowsLook,
  row: ScreenRow,
  part: RowPart | undefined,
  marks: readonly FindMark[],
): KeptRow | undefined {
  const before = kept.get(rowKey(row));
  return before !== undefined &&
    before.row.text === row.row.text &&
    before.from === (part?.from ?? row.from) &&
    before.to === (part?.to ?? row.to) &&
    before.column === (part?.column ?? 0) &&
    before.colored === colored &&
    sameMarks(before.marks, marks) &&
    before.blanks === showWhitespace &&
    before.limit === (wrapAt ?? Infinity) &&
    before.generation === tiles.generation
    ? before
    : undefined;
}

function drawnRow(
  painting: CellPainting,
  drawing: TextDrawing,
  look: RowsLook,
  row: ScreenRow,
  part: RowPart | undefined,
  marks: readonly FindMark[],
  y: number,
): boolean {
  const { frame } = drawing;
  const from = part?.from ?? row.from;
  const to = part?.to ?? row.to;
  const column = part?.column ?? 0;
  const tilesFrom = frame.tileCount;
  const rectsFrom = frame.rectCount;
  const missing = frame.missing;
  drawRow(
    drawing,
    row,
    piecesOf(look.colored, row, marks, from, to),
    column,
    y,
  );
  if (frame.missing !== missing) {
    return false;
  }
  painting.kept.set(rowKey(row), {
    row: row.row,
    from,
    to,
    column,
    colored: look.colored,
    marks,
    blanks: look.showWhitespace,
    limit: drawing.limit,
    generation: painting.tiles.generation,
    first: look.first,
    y,
    cells: frame.kept(tilesFrom, rectsFrom),
    used: painting.paints,
  });
  return true;
}

function forgetOldest({ kept }: CellPainting, most: number): void {
  if (kept.size <= most) {
    return;
  }
  const oldest = [...kept]
    .toSorted(([, one], [, other]) => one.used - other.used)
    .slice(0, kept.size - Math.ceil(most / 2));
  for (const [key] of oldest) {
    kept.delete(key);
  }
}

export function paintRows(
  painting: CellPainting,
  shown: ShownRows,
  budget: number,
): boolean {
  const { tiles, frame } = painting;
  const { rows, parts, marksOf, first } = shown;
  const { advance, rowHeight } = tiles.metrics;
  const drawing = drawingOn(painting, frame, shown);
  painting.paints++;
  frame.reset();
  tiles.within(budget);
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const y = index * rowHeight;
    const part = parts[index];
    const marks = marksOf(row);
    const before = keptOf(painting, shown, row, part, marks);
    if (before === undefined) {
      drawnRow(painting, drawing, shown, row, part, marks, y);
    } else {
      frame.append(
        before.cells,
        (before.first - first) * advance,
        y - before.y,
      );
      before.used = painting.paints;
    }
  }
  forgetOldest(painting, Math.max(1, rows.length) * keptScreens);
  return frame.missing === 0;
}

export function prepareRow(
  painting: CellPainting,
  look: RowsLook,
  row: ScreenRow,
  part: RowPart | undefined,
): boolean {
  const marks = look.marksOf(row);
  if (keptOf(painting, look, row, part, marks) !== undefined) {
    return true;
  }
  const { scratch } = painting;
  scratch.reset();
  return drawnRow(
    painting,
    drawingOn(painting, scratch, look),
    look,
    row,
    part,
    marks,
    0,
  );
}
