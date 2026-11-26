import { tabSizeOf } from '../../../lib/page/tabStops';
import { markPieces, type FindMark } from './marks';
import { marksWithin, piecesWithin, type ScreenRow } from './lines';
import { blankRuns } from '../../../lib/page/rowBreaks';
import type { TextWidths } from '../../../lib/page/textWidths';
import { strings } from '../../../lib/shared/strings';
import type { TextLine } from './lines';
import { CellFrame, type KeptCells } from './cellFrame';
import type { GlyphTiles } from './glyphTiles';
import { packedOf } from './cellColors';
import {
  cellsOf,
  drawDigits,
  drawDot,
  drawGap,
  drawPieces,
  drawSign,
  fillOn,
  tintsOver,
  type DotBox,
  type DrawnPiece,
  type TextDrawing,
  type TextPalette,
} from './textCells';
import type { ColoredSegment } from '../../syntax/page/lineColors';
import {
  breakSelected,
  selectedAmong,
  type CharRange,
  type SelectionShape,
  type TextSelection,
} from './textSelection';

export interface RowPart {
  readonly from: number;
  readonly to: number;
  readonly column: number;
}

export type SegmentsOf = (
  row: TextLine,
) => readonly ColoredSegment[] | undefined;

export interface RowTints {
  readonly row?: string | undefined;
  readonly word?: string | undefined;
  readonly words?: readonly CharRange[] | undefined;
  readonly gaps?: readonly number[] | undefined;
}

export interface Band {
  readonly top: number;
  readonly height: number;
  readonly tint?: string | undefined;
  readonly numbers?: readonly (string | undefined)[] | undefined;
}

interface Gutter {
  readonly rights: readonly number[];
  readonly line?: number | undefined;
}

export interface RowsLook {
  readonly wrapAt: number | undefined;
  readonly segmentsOf: SegmentsOf | undefined;
  readonly marksOf: (row: ScreenRow) => readonly FindMark[];
  readonly showWhitespace: boolean;
  readonly widths: TextWidths;
  readonly widthsOf?: ((row: TextLine) => TextWidths) | undefined;
  readonly first: number;
  readonly selection?: TextSelection | undefined;
  readonly selections?: readonly TextSelection[] | undefined;
  readonly shape?: SelectionShape | undefined;
  readonly tintsOf?: ((row: TextLine) => RowTints | undefined) | undefined;
  readonly left?: number | undefined;
}

export interface ShownRows extends RowsLook {
  readonly rows: readonly ScreenRow[];
  readonly parts: readonly (RowPart | undefined)[];
  readonly tops?: readonly number[] | undefined;
  readonly bands?: readonly Band[] | undefined;
  readonly gutter?: Gutter | undefined;
}

interface KeptRow {
  readonly row: TextLine;
  readonly from: number;
  readonly to: number;
  readonly column: number;
  readonly segmentsOf: SegmentsOf | undefined;
  readonly marks: readonly FindMark[];
  readonly tints: RowTints | undefined;
  readonly selected: readonly CharRange[];
  readonly breakSelected: boolean;
  readonly blanks: boolean;
  readonly limit: number;
  readonly left: number;
  readonly tabSize: number;
  readonly generation: number;
  readonly first: number;
  readonly y: number;
  readonly cells: KeptCells;
  used: number;
}

export interface CellPainting {
  readonly tiles: GlyphTiles;
  readonly frame: CellFrame;
  readonly under: CellFrame;
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
  under: CellFrame = new CellFrame(),
): CellPainting => ({
  tiles,
  frame,
  under,
  scratch: new CellFrame(),
  dot,
  kept: new Map(),
  palette,
  paints: 0,
});

const keptScreens = 8;

function selectedPieces(
  pieces: readonly DrawnPiece[],
  selected: CharRange,
): readonly DrawnPiece[] {
  const split: DrawnPiece[] = [];
  let at = 0;
  for (const piece of pieces) {
    const end = at + piece.text.length;
    const from = Math.max(at, selected.from);
    const to = Math.min(end, selected.to);
    if (to <= from) {
      split.push(piece);
    } else {
      if (from > at) {
        split.push({ ...piece, text: piece.text.slice(0, from - at) });
      }
      split.push({
        ...piece,
        text: piece.text.slice(from - at, to - at),
        selected: true,
      });
      if (to < end) {
        split.push({ ...piece, text: piece.text.slice(to - at) });
      }
    }
    at = end;
  }
  return split;
}

function tintedPieces(
  pieces: readonly DrawnPiece[],
  { row, word, words = [], gaps = [] }: RowTints,
  from: number,
): readonly DrawnPiece[] {
  if (word === undefined || (words.length === 0 && gaps.length === 0)) {
    return pieces;
  }
  const tint = tintsOver(row, word);
  const marked = new Set(gaps);
  const edges = [
    ...new Set([...words.flatMap((range) => [range.from, range.to]), ...gaps]),
  ].toSorted((one, other) => one - other);
  const split: DrawnPiece[] = [];
  let edge = 0;
  let inside = 0;
  let at = from;
  for (const piece of pieces) {
    const end = at + piece.text.length;
    for (let start = at; start < end;) {
      while (edge < edges.length && (edges[edge] ?? 0) <= start) {
        edge++;
      }
      while (inside < words.length && (words[inside]?.to ?? 0) <= start) {
        inside++;
      }
      const cut = Math.min(end, edges[edge] ?? end);
      const range = words[inside];
      split.push({
        ...piece,
        text: piece.text.slice(start - at, cut - at),
        ...(range !== undefined &&
          range.from <= start &&
          cut <= range.to && { tint }),
        ...(marked.has(start) && { gapBefore: tint }),
      });
      start = cut;
    }
    at = end;
  }
  return split;
}

function piecesOf(
  segmentsOf: SegmentsOf | undefined,
  row: ScreenRow,
  marks: readonly FindMark[],
  tints: RowTints | undefined,
  selected: readonly CharRange[],
  from: number,
  to: number,
): readonly DrawnPiece[] {
  const segments = piecesWithin(
    segmentsOf?.(row.row) ?? [{ text: row.row.text }],
    from,
    to,
  );
  const found: readonly DrawnPiece[] =
    marks.length === 0
      ? segments
      : markPieces(segments, marksWithin(marks, from, to));
  const marked = selected.reduce(
    (pieces, range) =>
      selectedPieces(pieces, { from: range.from - from, to: range.to - from }),
    found,
  );
  return tints === undefined ? marked : tintedPieces(marked, tints, from);
}

const sameRanges = (one: readonly CharRange[], other: readonly CharRange[]) =>
  one === other ||
  (one.length === other.length &&
    one.every(
      (range, at) =>
        range.from === other[at]?.from && range.to === other[at]?.to,
    ));

const sameMarks = (one: readonly FindMark[], other: readonly FindMark[]) =>
  one === other || (one.length === 0 && other.length === 0);

function drawRow(
  drawing: TextDrawing,
  row: ScreenRow,
  pieces: readonly DrawnPiece[],
  column: number,
  y: number,
  withBreak: boolean,
  tints: RowTints | undefined,
  ends: boolean,
): void {
  const end = drawPieces(drawing, pieces, column, y, tints?.row);
  if (
    ends &&
    tints?.word !== undefined &&
    tints.gaps?.includes(row.row.text.length) === true
  ) {
    drawGap(drawing, end, y, tintsOver(tints.row, tints.word));
  }
  if (ends && drawing.blanks && row.row.ending !== undefined) {
    const after =
      row.row.text.endsWith('\r') && cellsOf(drawing, '\r') === 0
        ? end + 1
        : end;
    for (let at = 0; at < row.row.ending.length; at++) {
      drawSign(drawing, row.row.ending[at], after + at, y, tints?.row);
    }
  }
  if (withBreak) {
    const { advance, rowHeight } = drawing.tiles.metrics;
    drawing.frame.rect(
      drawing.left + Math.round((end - drawing.first) * advance),
      y,
      advance,
      rowHeight,
      fillOn(drawing.palette, tints?.row, undefined, true),
    );
  }
  if (!drawing.blanks) {
    for (const run of blankRuns(row.hanging)) {
      if (run.tab) {
        drawSign(drawing, strings.symbols.tab, run.column, y, tints?.row);
      } else {
        for (let at = 0; at < run.columns; at++) {
          drawDot(drawing, run.column + at, y, tints?.row);
        }
      }
    }
  }
  if (row.breakAt !== undefined) {
    drawSign(drawing, strings.symbols.breaks, row.breakAt, y, tints?.row);
  }
}

const drawingOn = (
  { tiles, palette, dot }: CellPainting,
  frame: CellFrame,
  { widths, showWhitespace, first, wrapAt, left = 0 }: RowsLook,
): TextDrawing => ({
  tiles,
  frame,
  palette,
  widths,
  blanks: showWhitespace,
  first,
  left,
  limit: wrapAt ?? Infinity,
  dot,
});

export const rowWidthsOf = (
  { widths, widthsOf }: Pick<RowsLook, 'widths' | 'widthsOf'>,
  row: TextLine,
): TextWidths => widthsOf?.(row) ?? widths;

export const rowKey = (row: ScreenRow): string =>
  `${row.row.start}:${row.from}`;

const noSelections: readonly TextSelection[] = [];

export const selectedOf = (
  { selection, selections = noSelections, shape }: RowsLook,
  row: ScreenRow,
  part: RowPart | undefined,
): readonly CharRange[] => {
  const from = part?.from ?? row.from;
  const to = part?.to ?? row.to;
  return shape === undefined
    ? selectedAmong([selection, ...selections], row.row, { from, to })
    : selection === undefined
      ? noRanges
      : shape
          .drawn(selection, row.row)
          .map((range) => ({
            from: Math.max(from, range.from),
            to: Math.min(to, range.to),
          }))
          .filter((range) => range.to > range.from);
};

const noRanges: readonly CharRange[] = [];

const breakSelectedOf = (
  { selection, selections = noSelections, shape }: RowsLook,
  row: ScreenRow,
  part: RowPart | undefined,
): boolean =>
  shape === undefined &&
  (part?.to ?? row.to) >= row.row.text.length &&
  (part?.to ?? row.to) > (part?.from ?? row.from) &&
  row.row.cut !== true &&
  (breakSelected(selection, row.row) ||
    selections.some((each) => breakSelected(each, row.row)));

function keptOf(
  { kept, tiles }: CellPainting,
  look: RowsLook,
  row: ScreenRow,
  part: RowPart | undefined,
  marks: readonly FindMark[],
): KeptRow | undefined {
  const { segmentsOf, showWhitespace, wrapAt } = look;
  const before = kept.get(rowKey(row));
  return before !== undefined &&
    before.row.text === row.row.text &&
    before.row.ending === row.row.ending &&
    before.from === (part?.from ?? row.from) &&
    before.to === (part?.to ?? row.to) &&
    before.column === (part?.column ?? 0) &&
    before.segmentsOf === segmentsOf &&
    before.tints === look.tintsOf?.(row.row) &&
    before.left === (look.left ?? 0) &&
    sameMarks(before.marks, marks) &&
    sameRanges(before.selected, selectedOf(look, row, part)) &&
    before.breakSelected === breakSelectedOf(look, row, part) &&
    before.blanks === showWhitespace &&
    before.limit === (wrapAt ?? Infinity) &&
    before.tabSize === tabSizeOf(rowWidthsOf(look, row.row)) &&
    before.generation === tiles.generation
    ? before
    : undefined;
}

export function drawScreenRow(
  drawing: TextDrawing,
  look: RowsLook,
  row: ScreenRow,
  part: RowPart | undefined,
  y: number,
  marks: readonly FindMark[] = look.marksOf(row),
): void {
  const from = part?.from ?? row.from;
  const to = part?.to ?? row.to;
  const tints = look.tintsOf?.(row.row);
  drawRow(
    look.widthsOf === undefined
      ? drawing
      : { ...drawing, widths: rowWidthsOf(look, row.row) },
    row,
    piecesOf(
      look.segmentsOf,
      row,
      marks,
      tints,
      selectedOf(look, row, part),
      from,
      to,
    ),
    part?.column ?? 0,
    y,
    breakSelectedOf(look, row, part),
    tints,
    to >= row.row.text.length,
  );
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
  const selected = selectedOf(look, row, part);
  const withBreak = breakSelectedOf(look, row, part);
  const tints = look.tintsOf?.(row.row);
  drawScreenRow(drawing, look, row, part, y, marks);
  if (frame.missing !== missing) {
    return false;
  }
  painting.kept.set(rowKey(row), {
    row: row.row,
    from,
    to,
    column,
    segmentsOf: look.segmentsOf,
    marks,
    tints,
    selected,
    breakSelected: withBreak,
    blanks: look.showWhitespace,
    limit: drawing.limit,
    left: drawing.left,
    tabSize: tabSizeOf(rowWidthsOf(look, row.row)),
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

const farAcross = 0x7fff;

function paintUnder(
  { tiles, under, palette, dot }: CellPainting,
  { bands = [], gutter }: ShownRows,
): void {
  under.reset();
  for (const { top, height, tint } of bands) {
    if (tint !== undefined) {
      under.rect(0, top, farAcross, height, fillOn(palette, tint));
    }
  }
  if (gutter?.line !== undefined && palette.look.line !== undefined) {
    under.rect(
      gutter.line,
      0,
      dot.hairline,
      farAcross,
      packedOf(palette.look.line),
    );
  }
  for (const { top, tint, numbers = [] } of bands) {
    for (const [column, digits] of numbers.entries()) {
      const right = gutter?.rights[column];
      if (digits !== undefined && right !== undefined) {
        drawDigits({ tiles, frame: under, palette }, digits, right, top, tint);
      }
    }
  }
}

export function paintRows(
  painting: CellPainting,
  shown: ShownRows,
  budget: number,
): boolean {
  const { tiles, frame, under } = painting;
  const { rows, parts, marksOf, first, tops } = shown;
  const { advance, rowHeight } = tiles.metrics;
  const drawing = drawingOn(painting, frame, shown);
  painting.paints++;
  frame.reset();
  tiles.within(budget);
  paintUnder(painting, shown);
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const y = tops?.[index] ?? index * rowHeight;
    const part = parts[index];
    const marks = marksOf(row);
    const before = keptOf(painting, shown, row, part, marks);
    if (before === undefined) {
      drawnRow(painting, drawing, shown, row, part, marks, y);
    } else {
      frame.append(
        before.cells,
        Math.round((before.first - first) * advance),
        y - before.y,
      );
      before.used = painting.paints;
    }
  }
  forgetOldest(painting, Math.max(1, rows.length) * keptScreens);
  return frame.missing === 0 && under.missing === 0;
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
