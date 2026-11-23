import { placesWithin } from './columns';
import type { FindMark } from './marks';
import { marksWithin, piecesWithin } from './lines';
import type { CellFrame } from './cellFrame';
import { rowKey, type CellPainting, type ShownRows } from './cellPainting';
import type { GlyphTiles } from './glyphTiles';
import { selectedAmong, type CharRange } from './textSelection';

interface SeenMark {
  readonly from: number;
  readonly to: number;
  readonly name: 'match' | 'current' | 'occurrence';
}

interface SeenPiece {
  readonly text: string;
  readonly kind: string;
}

export interface SeenPlace {
  readonly left: number;
  readonly top: number;
  readonly advance: number;
  readonly rowHeight: number;
  readonly scale?: number | undefined;
}

export interface SeenRow {
  readonly key: string;
  readonly text: string;
  readonly line?: string | undefined;
  readonly from: number;
  readonly scrolled: number;
  readonly column: number;
  readonly left: number;
  readonly top: number;
  readonly height: number;
  readonly advance: number;
  readonly pieces: readonly SeenPiece[];
  readonly marks: readonly SeenMark[];
  readonly selected: CharRange | undefined;
  readonly selections?: readonly CharRange[] | undefined;
  readonly breakAt: number | undefined;
  readonly continues: boolean;
  readonly tint?: string | undefined;
  readonly words?: readonly CharRange[] | undefined;
  readonly numbers?: readonly (string | undefined)[] | undefined;
  readonly numberEnds?: readonly number[] | undefined;
}

export interface SeenGlyph {
  readonly row: number;
  readonly column: number;
}

declare global {
  interface HTMLElement {
    seenRows?: (() => readonly SeenRow[]) | undefined;
    seenPlaces?:
      | ((row: number) => readonly (readonly [at: number, column: number])[])
      | undefined;
    seenGlyphs?: ((cluster: string) => readonly SeenGlyph[]) | undefined;
    seenDots?: (() => readonly SeenGlyph[]) | undefined;
  }
}

const plain = 'plain';

const nameOf = ({ current, occurrence }: FindMark): SeenMark['name'] =>
  occurrence === true ? 'occurrence' : current ? 'current' : 'match';

export function seenRows(
  {
    rows,
    parts,
    segmentsOf,
    marksOf,
    selection,
    selections,
    first,
    tops,
    bands,
    tintsOf,
    gutter,
    left: textLeft = 0,
  }: ShownRows,
  place: SeenPlace,
): SeenRow[] {
  return rows.map((row, index) => {
    const part = parts[index];
    const from = part?.from ?? row.from;
    const to = part?.to ?? row.to;
    const all = selectedAmong([selection, ...(selections ?? [])], row.row, {
      from,
      to,
    }).map((range) => ({ from: range.from - from, to: range.to - from }));
    const column = part?.column ?? 0;
    const down = tops?.[index];
    const tints = tintsOf?.(row.row);
    const band =
      down === undefined ? undefined : bands?.find((each) => each.top === down);
    return {
      key: rowKey(row),
      text: row.row.text.slice(from, to),
      ...(rows[index - 1]?.row !== row.row && { line: row.row.text }),
      from,
      scrolled: first * place.advance,
      column,
      left: place.left + (column - first) * place.advance,
      top:
        place.top +
        (down === undefined
          ? index * place.rowHeight
          : down / (place.scale ?? 1)),
      height: place.rowHeight,
      ...(tints?.row !== undefined && { tint: tints.row }),
      ...(tints?.words !== undefined && {
        words: tints.words
          .filter((word) => word.to > from && word.from < to)
          .map((word) => ({
            from: Math.max(word.from, from) - from,
            to: Math.min(word.to, to) - from,
          })),
      }),
      ...(band?.numbers !== undefined && {
        numbers: band.numbers,
        numberEnds: (gutter?.rights ?? []).map(
          (right) => place.left + (right - textLeft) / (place.scale ?? 1),
        ),
      }),
      advance: place.advance,
      pieces: piecesWithin(
        segmentsOf?.(row.row) ?? [{ text: row.row.text }],
        from,
        to,
      ).map(({ text, kind }) => ({ text, kind: kind ?? plain })),
      marks: marksWithin(marksOf(row), from, to).map((mark) => ({
        from: mark.start,
        to: mark.end,
        name: nameOf(mark),
      })),
      selected: all[0],
      ...(selections !== undefined && { selections: all }),
      breakAt: row.breakAt,
      continues: row.to < row.row.text.length || row.row.cut === true,
    };
  });
}

export function seenPlaces(
  { rows, parts, widths }: ShownRows,
  index: number,
): (readonly [at: number, column: number])[] {
  const row = rows[index];
  const part = parts[index];
  return row === undefined
    ? []
    : placesWithin(
        row.row.text,
        part?.from ?? row.from,
        part?.to ?? row.to,
        part?.column ?? 0,
        widths,
      );
}

const rowOf = (
  tops: readonly number[] | undefined,
  y: number,
  rowHeight: number,
): number => {
  const found = tops?.indexOf(y) ?? -1;
  return found === -1 ? Math.round(y / rowHeight) : found;
};

export function seenGlyphs(
  frame: CellFrame,
  tiles: GlyphTiles,
  cluster: string,
  first: number,
  left = 0,
  tops?: readonly number[],
): SeenGlyph[] {
  const { advance, rowHeight } = tiles.metrics;
  const drawn = new Set(
    tiles.tilesOf(cluster).map((tile) => `${tiles.us[tile]}:${tiles.vs[tile]}`),
  );
  return frame
    .tilesPlaced()
    .filter(({ u, v }) => drawn.has(`${u}:${v}`))
    .map(({ x, y }) => ({
      row: rowOf(tops, y + tiles.padY, rowHeight),
      column: Math.round((x + tiles.padX - left) / advance + first),
    }));
}

export function seenDots(
  { frame, tiles, dot, palette }: CellPainting,
  first: number,
  left = 0,
  tops?: readonly number[],
): SeenGlyph[] {
  const { advance, rowHeight } = tiles.metrics;
  const fills = new Set(palette.dotFills.values());
  return frame
    .rectsPlaced()
    .filter(
      ({ width, height, color }) =>
        width === dot.size && height === dot.size && fills.has(color),
    )
    .map(({ x, y }) => ({
      row: rowOf(tops, y - dot.top, rowHeight),
      column: Math.round((x - dot.left - left) / advance + first),
    }));
}
