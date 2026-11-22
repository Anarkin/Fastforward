import { blankSignOf, signedBlank } from '../../../lib/page/blankSigns';
import {
  hasControls,
  pictureOf,
  pictured,
} from '../../../lib/page/controlPictures';
import { graphemes, nonAscii } from '../../../lib/page/graphemes';
import { tabStop } from '../../../lib/page/tabStops';
import type { TextWidths } from '../../../lib/page/textWidths';
import { strings } from '../../../lib/shared/strings';
import { packedOf, type Rgba } from './cellColors';
import type { CellFrame } from './cellFrame';
import { notDrawn, type GlyphStyle, type GlyphTiles } from './glyphTiles';

const space = 32;
const tab = 9;
const lastPrintable = 126;
const signs = 'signs';

type Mark = 'match' | 'current' | 'occurrence' | undefined;

interface MarkLook {
  readonly ink: string | undefined;
  readonly ground: Rgba;
}

export interface TextLook {
  readonly ground: Rgba;
  readonly muted: string;
  readonly dots: Rgba;
  readonly plain: string;
  readonly kinds: ReadonlyMap<string, string>;
  readonly match: MarkLook;
  readonly current: MarkLook;
  readonly occurrence: MarkLook;
}

export interface TextPalette {
  readonly look: TextLook;
  readonly styles: Map<string, GlyphStyle>;
  readonly fills: Map<Mark, number>;
  readonly dotFill: number;
}

export const paletteOf = (look: TextLook): TextPalette => ({
  look,
  styles: new Map(),
  fills: new Map(),
  dotFill: packedOf(look.dots),
});

export interface DotBox {
  readonly size: number;
  readonly left: number;
  readonly top: number;
}

export interface TextDrawing {
  readonly tiles: GlyphTiles;
  readonly frame: CellFrame;
  readonly palette: TextPalette;
  readonly widths: TextWidths;
  readonly blanks: boolean;
  readonly first: number;
  readonly limit: number;
  readonly dot: DotBox;
}

export interface DrawnPiece {
  readonly text: string;
  readonly kind?: string | undefined;
  readonly mark?: Mark;
}

const alone = (code: number) =>
  code < space ||
  (code >= 0x7f && code < 0x300) ||
  (code >= 0x4e00 && code <= 0x9fff) ||
  (code >= 0x3041 && code <= 0x3096) ||
  (code >= 0x30a1 && code <= 0x30fa) ||
  (code >= 0xac00 && code <= 0xd7a3) ||
  (code >= 0xff01 && code <= 0xff5e);

const joins = (next: number) => next >= 0x300 && !alone(next);

const standsAlone = (code: number, next: number) => alone(code) && !joins(next);

type Styled = Pick<TextDrawing, 'tiles' | 'palette'>;

function styleOf(
  { tiles, palette }: Styled,
  kind: string | undefined,
  mark: Mark,
): GlyphStyle {
  const key = mark === undefined ? (kind ?? '') : `${kind ?? ''}/${mark}`;
  let style = palette.styles.get(key);
  if (style === undefined) {
    const { look } = palette;
    const colored =
      (kind === undefined ? undefined : look.kinds.get(kind)) ?? look.plain;
    const marked = mark === undefined ? undefined : look[mark];
    style = tiles.style(marked?.ink ?? colored, marked?.ground ?? look.ground);
    palette.styles.set(key, style);
  }
  return style;
}

function fillOf({ palette }: TextDrawing, mark: Mark): number {
  let fill = palette.fills.get(mark);
  if (fill === undefined) {
    const { look } = palette;
    fill = packedOf(mark === undefined ? look.ground : look[mark].ground);
    palette.fills.set(mark, fill);
  }
  return fill;
}

function cellsOf({ widths }: TextDrawing, cluster: string): number {
  return Math.round(widths.of(cluster) / widths.char);
}

function glyphOf(
  drawing: TextDrawing,
  style: GlyphStyle,
  cluster: string,
): number {
  const { widths, tiles } = drawing;
  const boxed = nonAscii.test(cluster) ? widths.boxed?.(cluster) : undefined;
  return tiles.glyph(
    style,
    cluster,
    cluster.length === 1 && hasControls(cluster)
      ? pictureOf(cluster.charCodeAt(0))
      : pictured(cluster),
    {
      cells: cellsOf(drawing, cluster),
      centered: boxed !== undefined,
      scale: boxed === undefined ? 1 : (widths.scaled?.(cluster) ?? 1),
    },
  );
}

function placed(
  { tiles, frame, first }: TextDrawing,
  style: GlyphStyle,
  tile: number,
  column: number,
  y: number,
): void {
  if (tile === notDrawn) {
    frame.missing++;
    return;
  }
  frame.tile(
    (column - first) * tiles.metrics.advance - tiles.padX,
    y - tiles.padY,
    tiles.us[tile],
    tiles.vs[tile],
    tiles.widths[tile],
    tiles.tileHeight,
    style.packed,
  );
}

export function textStyles(styled: Styled): GlyphStyle[] {
  return [
    ...new Set(
      [undefined, ...styled.palette.look.kinds.keys()].map((kind) =>
        styleOf(styled, kind, undefined),
      ),
    ),
  ];
}

export function drawSign(
  drawing: TextDrawing,
  sign: string,
  column: number,
  y: number,
): void {
  const { tiles, palette } = drawing;
  let style = palette.styles.get(signs);
  if (style === undefined) {
    style = tiles.style(palette.look.muted, palette.look.ground);
    palette.styles.set(signs, style);
  }
  placed(
    drawing,
    style,
    tiles.known(style, sign) ??
      tiles.glyph(style, sign, sign, { cells: 1, centered: false, scale: 1 }),
    column,
    y,
  );
}

export function drawDot(
  { tiles, frame, first, dot, palette }: TextDrawing,
  column: number,
  y: number,
): void {
  frame.rect(
    (column - first) * tiles.metrics.advance + dot.left,
    y + dot.top,
    dot.size,
    dot.size,
    palette.dotFill,
  );
}

function drawText(
  drawing: TextDrawing,
  text: string,
  style: GlyphStyle,
  from: number,
  y: number,
): number {
  const { tiles, blanks, limit } = drawing;
  let column = from;
  let clusters: Intl.Segments | undefined;
  for (let at = 0; at < text.length;) {
    const code = text.charCodeAt(at);
    if (code === space) {
      if (blanks && column <= limit) {
        drawDot(drawing, column, y);
      }
      column++;
      at++;
    } else if (
      code > space &&
      code <= lastPrintable &&
      !joins(text.charCodeAt(at + 1))
    ) {
      const known = style.ascii[code];
      placed(
        drawing,
        style,
        known < 0 ? tiles.ascii(style, code) : known,
        column,
        y,
      );
      column++;
      at++;
    } else if (code === tab) {
      if (blanks) {
        drawSign(drawing, strings.symbols.tab, column, y);
      }
      column = tabStop(column);
      at++;
    } else {
      let cluster = text[at];
      if (!standsAlone(code, text.charCodeAt(at + 1))) {
        clusters ??= graphemes.segment(text);
        const found = clusters.containing(at);
        cluster =
          found === undefined ? cluster : found.segment.slice(at - found.index);
      }
      at += cluster.length;
      if (blanks && signedBlank.test(cluster)) {
        drawSign(drawing, blankSignOf(cluster), column, y);
        column += cellsOf(drawing, cluster);
      } else {
        const tile =
          tiles.known(style, cluster) ?? glyphOf(drawing, style, cluster);
        placed(drawing, style, tile, column, y);
        column +=
          tile === notDrawn ? cellsOf(drawing, cluster) : tiles.cells[tile];
      }
    }
  }
  return column;
}

export function drawPieces(
  drawing: TextDrawing,
  pieces: readonly DrawnPiece[],
  from: number,
  y: number,
): number {
  const { tiles, frame, first } = drawing;
  const { advance, rowHeight } = tiles.metrics;
  let column = from;
  for (const { text, kind, mark } of pieces) {
    const start = column;
    column = drawText(drawing, text, styleOf(drawing, kind, mark), column, y);
    if (mark !== undefined && column > start) {
      frame.rect(
        (start - first) * advance,
        y,
        (column - start) * advance,
        rowHeight,
        fillOf(drawing, mark),
      );
    }
  }
  return column;
}
