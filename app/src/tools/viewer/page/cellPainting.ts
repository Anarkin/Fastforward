import { blankRuns } from '../../../lib/page/rowBreaks';
import type { TextWidths } from '../../../lib/page/textWidths';
import { strings } from '../../../lib/shared/strings';
import type { TextRow } from '../shared/protocol';
import type { CellFrame, KeptCells } from './cellFrame';
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

export interface ShownRows {
  readonly rows: readonly ScreenRow[];
  readonly parts: readonly (RowPart | undefined)[];
  readonly wrapAt: number | undefined;
  readonly colored: ColoredText | undefined;
  readonly marksOf: (row: ScreenRow) => readonly FindMark[];
  readonly showWhitespace: boolean;
  readonly widths: TextWidths;
  readonly first: number;
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
): CellPainting => ({ tiles, frame, dot, kept: new Map(), palette, paints: 0 });

const keptScreens = 4;

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

export function paintRows(
  painting: CellPainting,
  {
    rows,
    parts,
    wrapAt,
    colored,
    marksOf,
    showWhitespace,
    widths,
    first,
  }: ShownRows,
  budget: number,
): boolean {
  const { tiles, frame, kept } = painting;
  const { advance, rowHeight } = tiles.metrics;
  const drawing: TextDrawing = {
    tiles,
    frame,
    palette: painting.palette,
    widths,
    blanks: showWhitespace,
    first,
    limit: wrapAt ?? Infinity,
    dot: painting.dot,
  };
  const { generation } = tiles;
  const paint = ++painting.paints;
  frame.reset();
  tiles.within(budget);
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const y = index * rowHeight;
    const part = parts[index];
    const from = part?.from ?? row.from;
    const to = part?.to ?? row.to;
    const column = part?.column ?? 0;
    const marks = marksOf(row);
    const key = `${row.row.start}:${row.from}`;
    const before = kept.get(key);
    if (
      before !== undefined &&
      before.row.text === row.row.text &&
      before.from === from &&
      before.to === to &&
      before.column === column &&
      before.colored === colored &&
      sameMarks(before.marks, marks) &&
      before.blanks === showWhitespace &&
      before.limit === drawing.limit &&
      before.generation === generation
    ) {
      frame.append(
        before.cells,
        (before.first - first) * advance,
        y - before.y,
      );
      before.used = paint;
      continue;
    }
    const tilesFrom = frame.tileCount;
    const rectsFrom = frame.rectCount;
    const missing = frame.missing;
    drawRow(drawing, row, piecesOf(colored, row, marks, from, to), column, y);
    if (frame.missing === missing) {
      kept.set(key, {
        row: row.row,
        from,
        to,
        column,
        colored,
        marks,
        blanks: showWhitespace,
        limit: drawing.limit,
        generation,
        first,
        y,
        cells: frame.kept(tilesFrom, rectsFrom),
        used: paint,
      });
    }
  }
  if (kept.size > rows.length * keptScreens) {
    for (const [key, row] of kept) {
      if (row.used !== paint) {
        kept.delete(key);
      }
    }
  }
  return frame.missing === 0;
}
