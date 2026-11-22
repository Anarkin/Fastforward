import type { FindMark } from './marks';
import { marksWithin, piecesWithin } from './lines';
import type { CellFrame } from './cellFrame';
import { rowKey, type CellPainting, type ShownRows } from './cellPainting';
import type { GlyphTiles } from './glyphTiles';
import { selectedIn, type CharRange } from './textSelection';

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
  readonly column: number;
  readonly left: number;
  readonly top: number;
  readonly height: number;
  readonly advance: number;
  readonly pieces: readonly SeenPiece[];
  readonly marks: readonly SeenMark[];
  readonly selected: CharRange | undefined;
  readonly breakAt: number | undefined;
  readonly continues: boolean;
  readonly tint?: string | undefined;
  readonly words?: readonly CharRange[] | undefined;
  readonly numbers?: readonly (string | undefined)[] | undefined;
}

export interface SeenGlyph {
  readonly row: number;
  readonly column: number;
}

declare global {
  interface HTMLElement {
    seenRows?: (() => readonly SeenRow[]) | undefined;
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
    first,
    tops,
    bands,
    tintsOf,
  }: ShownRows,
  place: SeenPlace,
): SeenRow[] {
  return rows.map((row, index) => {
    const part = parts[index];
    const from = part?.from ?? row.from;
    const to = part?.to ?? row.to;
    const selected = selectedIn(selection, row.row, { from, to });
    const column = part?.column ?? 0;
    const down = tops?.[index];
    const tints = tintsOf?.(row.row);
    const band =
      down === undefined ? undefined : bands?.find((each) => each.top === down);
    return {
      key: rowKey(row),
      text: row.row.text.slice(from, to),
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
      ...(band?.numbers !== undefined && { numbers: band.numbers }),
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
      selected: selected && {
        from: selected.from - from,
        to: selected.to - from,
      },
      breakAt: row.breakAt,
      continues: row.to < row.row.text.length || row.row.cut === true,
    };
  });
}

export function seenGlyphs(
  frame: CellFrame,
  tiles: GlyphTiles,
  cluster: string,
  first: number,
): SeenGlyph[] {
  const { advance, rowHeight } = tiles.metrics;
  const drawn = new Set(
    tiles.tilesOf(cluster).map((tile) => `${tiles.us[tile]}:${tiles.vs[tile]}`),
  );
  return frame
    .tilesPlaced()
    .filter(({ u, v }) => drawn.has(`${u}:${v}`))
    .map(({ x, y }) => ({
      row: Math.round((y + tiles.padY) / rowHeight),
      column: Math.round((x + tiles.padX) / advance) + first,
    }));
}

export function seenDots(
  { frame, tiles, dot, palette }: CellPainting,
  first: number,
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
      row: Math.floor(y / rowHeight),
      column: Math.round((x - dot.left) / advance) + first,
    }));
}
