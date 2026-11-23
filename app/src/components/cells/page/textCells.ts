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
import { filled, over, packedOf, type Rgba } from './cellColors';
import type { CellFrame } from './cellFrame';
import { notDrawn, type GlyphStyle, type GlyphTiles } from './glyphTiles';
import { joins, standsAlone } from './joined';

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
  readonly dot?: Rgba | undefined;
  readonly plain: string;
  readonly kinds: ReadonlyMap<string, string>;
  readonly match: MarkLook;
  readonly current: MarkLook;
  readonly occurrence: MarkLook;
  readonly selected: Rgba;
  readonly outline: Rgba;
  readonly tints?: ReadonlyMap<string, Rgba> | undefined;
  readonly line?: Rgba | undefined;
}

export interface TextPalette {
  readonly look: TextLook;
  readonly styles: Map<string, GlyphStyle>;
  readonly grounds: Map<string, Rgba>;
  readonly dotFills: Map<string | undefined, number>;
  readonly outline: number;
}

export const paletteOf = (look: TextLook): TextPalette => ({
  look,
  styles: new Map(),
  grounds: new Map(),
  dotFills: new Map([[undefined, packedOf(look.dots)]]),
  outline: packedOf(look.outline),
});

const tintsApart = '+';

export const tintsOver = (under: string | undefined, tint: string): string =>
  under === undefined ? tint : `${under}${tintsApart}${tint}`;

function groundOn(
  { look, grounds }: TextPalette,
  tint: string | undefined,
  mark?: Mark,
  selected = false,
): Rgba {
  if (tint === undefined && mark === undefined && !selected) {
    return look.ground;
  }
  const key = `${tint ?? ''}/${mark ?? ''}/${selected ? 'selected' : ''}`;
  let ground = grounds.get(key);
  if (ground === undefined) {
    ground = look.ground;
    for (const name of tint === undefined ? [] : tint.split(tintsApart)) {
      const layer = look.tints?.get(name);
      ground = layer === undefined ? ground : filled(ground, layer);
    }
    if (selected) {
      ground = filled(ground, look.selected);
    } else if (mark !== undefined) {
      ground = filled(ground, look[mark].ground);
    }
    grounds.set(key, ground);
  }
  return ground;
}

function dotFillOn(palette: TextPalette, tint: string | undefined): number {
  let fill = palette.dotFills.get(tint);
  if (fill === undefined) {
    const { dot, dots } = palette.look;
    fill = packedOf(
      dot === undefined ? dots : over(groundOn(palette, tint), dot),
    );
    palette.dotFills.set(tint, fill);
  }
  return fill;
}

export const fillOn = (
  palette: TextPalette,
  tint: string | undefined,
  mark?: Mark,
  selected = false,
): number => packedOf(groundOn(palette, tint, mark, selected));

export interface DotBox {
  readonly size: number;
  readonly left: number;
  readonly top: number;
  readonly hairline: number;
  readonly gap: number;
}

export interface TextDrawing {
  readonly tiles: GlyphTiles;
  readonly frame: CellFrame;
  readonly palette: TextPalette;
  readonly widths: TextWidths;
  readonly blanks: boolean;
  readonly first: number;
  readonly left: number;
  readonly limit: number;
  readonly dot: DotBox;
}

export interface DrawnPiece {
  readonly text: string;
  readonly kind?: string | undefined;
  readonly mark?: Mark;
  readonly selected?: boolean;
  readonly tint?: string | undefined;
  readonly gapBefore?: string | undefined;
}

type Styled = Pick<TextDrawing, 'tiles' | 'palette'>;

function styleOf(
  { tiles, palette }: Styled,
  kind: string | undefined,
  mark: Mark,
  selected = false,
  tint?: string,
): GlyphStyle {
  const key =
    mark === undefined && !selected && tint === undefined
      ? (kind ?? '')
      : `${kind ?? ''}/${mark ?? ''}/${selected ? 'selected' : ''}/${tint ?? ''}`;
  let style = palette.styles.get(key);
  if (style === undefined) {
    const { look } = palette;
    const colored =
      (kind === undefined ? undefined : look.kinds.get(kind)) ?? look.plain;
    const marked = mark === undefined ? undefined : look[mark];
    style = tiles.style(
      marked?.ink ?? colored,
      groundOn(palette, tint, mark, selected),
    );
    palette.styles.set(key, style);
  }
  return style;
}

function mutedStyle({ tiles, palette }: Styled, tint?: string): GlyphStyle {
  const key = tint === undefined ? signs : `${signs}/${tint}`;
  let style = palette.styles.get(key);
  if (style === undefined) {
    style = tiles.style(palette.look.muted, groundOn(palette, tint));
    palette.styles.set(key, style);
  }
  return style;
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
  { tiles, frame, first, left }: TextDrawing,
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
    left + Math.round((column - first) * tiles.metrics.advance) - tiles.padX,
    y - tiles.padY,
    tiles.us[tile],
    tiles.vs[tile],
    tiles.widths[tile],
    tiles.tileHeight,
    style.packed,
  );
}

export function drawDigits(
  { tiles, frame, palette }: Pick<TextDrawing, 'tiles' | 'frame' | 'palette'>,
  digits: string,
  right: number,
  y: number,
  tint: string | undefined,
): void {
  const style = mutedStyle({ tiles, palette }, tint);
  const { advance } = tiles.metrics;
  for (let at = 0; at < digits.length; at++) {
    const code = digits.charCodeAt(at);
    const known = style.ascii[code] ?? notDrawn;
    const tile = known < 0 ? tiles.ascii(style, code) : known;
    if (tile === notDrawn) {
      frame.missing++;
    } else {
      frame.tile(
        right - (digits.length - at) * advance - tiles.padX,
        y - tiles.padY,
        tiles.us[tile],
        tiles.vs[tile],
        tiles.widths[tile],
        tiles.tileHeight,
        style.packed,
      );
    }
  }
}

export function drawGap(
  { tiles, frame, first, left, dot, palette }: TextDrawing,
  column: number,
  y: number,
  tint: string,
): void {
  const width = dot.gap;
  frame.rect(
    left +
      Math.round((column - first) * tiles.metrics.advance) -
      Math.floor(width / 2),
    y,
    width,
    tiles.metrics.rowHeight,
    fillOn(palette, tint),
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
  tint?: string,
): void {
  const { tiles } = drawing;
  const style = mutedStyle(drawing, tint);
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
  { tiles, frame, first, left, dot, palette }: TextDrawing,
  column: number,
  y: number,
  tint?: string,
): void {
  frame.rect(
    left + Math.round((column - first) * tiles.metrics.advance) + dot.left,
    y + dot.top,
    dot.size,
    dot.size,
    dotFillOn(palette, tint),
  );
}

function drawText(
  drawing: TextDrawing,
  text: string,
  style: GlyphStyle,
  from: number,
  y: number,
  tint: string | undefined,
  under: string | undefined,
): number {
  const { tiles, blanks, limit } = drawing;
  let column = from;
  let clusters: Intl.Segments | undefined;
  for (let at = 0; at < text.length;) {
    const code = text.charCodeAt(at);
    if (code === space) {
      if (blanks && column <= limit) {
        drawDot(drawing, column, y, under);
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
        drawSign(drawing, strings.symbols.tab, column, y, tint);
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
        drawSign(drawing, blankSignOf(cluster), column, y, tint);
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
  rowTint?: string,
): number {
  const { tiles, frame, first, left: textLeft } = drawing;
  const { advance, rowHeight } = tiles.metrics;
  let column = from;
  for (const [index, piece] of pieces.entries()) {
    const { text, kind, mark, selected } = piece;
    const tint = piece.tint ?? rowTint;
    const start = column;
    if (piece.gapBefore !== undefined) {
      drawGap(drawing, column, y, piece.gapBefore);
    }
    const under =
      mark !== undefined || selected === true || tint !== rowTint
        ? frame.rect(0, y, 0, 0, 0)
        : undefined;
    const style = styleOf(drawing, kind, mark, selected, tint);
    column = drawText(
      drawing,
      text,
      style,
      column,
      y,
      mark === undefined && selected !== true ? tint : undefined,
      tint,
    );
    if (under !== undefined && column > start) {
      frame.rectAt(
        under,
        textLeft + Math.round((start - first) * advance),
        y,
        (column - start) * advance,
        rowHeight,
        style.packed,
      );
    }
    if (mark === 'current' && column > start) {
      const { hairline } = drawing.dot;
      const { outline } = drawing.palette;
      const left = textLeft + Math.round((start - first) * advance);
      const width = (column - start) * advance;
      frame.rect(left, y, width, hairline, outline);
      frame.rect(left, y + rowHeight - hairline, width, hairline, outline);
      if (pieces[index - 1]?.mark !== 'current') {
        frame.rect(left - hairline, y, hairline, rowHeight, outline);
      }
      if (pieces[index + 1]?.mark !== 'current') {
        frame.rect(left + width, y, hairline, rowHeight, outline);
      }
    }
  }
  return column;
}
