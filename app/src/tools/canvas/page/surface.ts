import { CellSurface } from '../../../components/cells/page/cellSurface';
import {
  cellMetricsOf,
  lookWithin,
  probedRow,
  type CellFont,
} from '../../../components/cells/page/cellLook';
import {
  over,
  packedOf,
  parsedColor,
  type Rgba,
} from '../../../components/cells/page/cellColors';
import {
  drawPieces,
  paletteOf,
  type TextDrawing,
  type TextLook,
} from '../../../components/cells/page/textCells';
import { dotBoxOf, nudgeOf } from '../../../components/cells/page/cellView';
import {
  gpuDevice,
  gpuGeneration,
} from '../../../components/cells/page/gpuDevice';
import type { CellTable } from '../../../lib/page/cellTable';
import { lineHeightOf } from '../../../lib/page/lineHeight';
import {
  elementWidths,
  fontOf,
  spacingOf,
  type TextWidths,
} from '../../../lib/page/textWidths';
import type { Board } from '../shared/board';
import { boundsOf, labelKind, lineKind, screenOf } from './boardScreen';
import { unitOf, type Unit } from './grid';
import { arrowRects, lineRects, strokeOf } from './lineRects';
import { gridDots } from './gridDots';
import { signKind } from './nodeText';
import { originOf, type CellSize, type Origin } from './pan';
import type { Screen } from './screen';
import { screenRows } from './seenScreen';

interface SeenBoard {
  readonly rows: readonly string[];
  readonly column: number;
  readonly row: number;
  readonly origin: Origin;
  readonly shift: { readonly x: number; readonly y: number };
  readonly advance: number;
  readonly rowHeight: number;
  readonly stroke: number;
}

declare global {
  interface HTMLElement {
    seenBoard?: (() => SeenBoard) | undefined;
  }
}

export const probeRowClass = 'board-probe-row';

const colorKinds = [1, 2, 3, 4, 5, 6].map(
  (preset) => [`color-${preset}`, `board-color-${preset}`] as const,
);

const gridKind = 'grid';

const lookKinds = [
  [gridKind, 'board-grid'],
  [lineKind, 'board-line'],
  [labelKind, 'board-label'],
  [signKind, 'board-sign'],
  ...colorKinds,
] as const;

const transparent = 0.001;

function groundOf(element: Element): Rgba {
  for (let at: Element | null = element; at !== null; at = at.parentElement) {
    const color = parsedColor(getComputedStyle(at).backgroundColor);
    if (color[3] > transparent) {
      return over([0, 0, 0, 1], color);
    }
  }
  return [0, 0, 0, 1];
}

export interface Drawn {
  readonly origin: Origin;
  readonly cell: CellSize;
  readonly view: CellSize;
}

interface Measured {
  readonly key: string;
  readonly unit: Unit;
  readonly widths: TextWidths;
  readonly font: CellFont;
}

export class BoardSurface {
  private surface: CellSurface | undefined;
  private look: { readonly key: string; readonly look: TextLook } | undefined;
  private readonly computed = new Map<string, string>();

  constructor(
    private readonly host: HTMLElement,
    private readonly body: HTMLElement,
    private readonly probe: HTMLElement,
  ) {}

  private measured(table: CellTable, ratio: number): Measured | undefined {
    const widths = elementWidths(this.probe, table);
    if (widths === undefined) {
      return undefined;
    }
    const font = {
      char: widths.char,
      family: fontOf(this.probe),
      spacing: spacingOf(this.probe),
    };
    return {
      key: `${font.family}|${font.char}|${ratio}|${gpuGeneration()}`,
      unit: unitOf(widths.char, lineHeightOf(this.probe, 18, ratio)),
      widths,
      font,
    };
  }

  private lookOf(key: string, ground: Rgba): TextLook {
    if (this.look?.key !== key) {
      const row = probedRow(this.host, probeRowClass);
      const look = lookWithin(row, ground, lookKinds);
      row.remove();
      this.look = { key, look };
    }
    return this.look.look;
  }

  private computedColor(css: string): string {
    let color = this.computed.get(css);
    if (color === undefined) {
      const row = probedRow(this.host, probeRowClass);
      row.style.color = css;
      color = getComputedStyle(row).color;
      row.remove();
      this.computed.set(css, color);
    }
    return color;
  }

  draw(
    board: Board,
    table: CellTable,
    panned: Origin | undefined,
  ): Drawn | undefined {
    const device = gpuDevice();
    if (device === undefined) {
      return undefined;
    }
    if (this.surface?.device !== device) {
      this.surface?.dispose();
      this.surface = new CellSurface(device);
      this.surface.canvas.className = 'board-canvas';
      this.host.append(this.surface.canvas);
    }
    const ratio = devicePixelRatio;
    const measured = this.measured(table, ratio);
    if (measured === undefined) {
      return undefined;
    }
    const { body, host } = this;
    const box = body.getBoundingClientRect();
    const nudge = nudgeOf(box.left, box.top, ratio);
    const pixelWidth = Math.round(body.clientWidth * ratio);
    const pixelHeight = Math.round(body.clientHeight * ratio);
    host.style.left = `${nudge.left}px`;
    host.style.top = `${nudge.top}px`;
    host.style.width = `${pixelWidth / ratio}px`;
    host.style.height = `${pixelHeight / ratio}px`;
    const cells = this.surface;
    cells.sized(pixelWidth, pixelHeight);
    const metrics = cellMetricsOf(
      host,
      measured.font,
      ratio,
      nudge.shift,
      probeRowClass,
    );
    const ground = groundOf(body);
    const scheme = matchMedia('(prefers-color-scheme: dark)').matches;
    const look = this.lookOf(`${ground.join(',')}|${scheme}`, ground);
    cells.grounded(ground);
    const tiles = cells.measured(measured.key, metrics);
    const { advance, rowHeight } = metrics;
    const { widths, unit } = measured;
    const cellsOf = (cluster: string) =>
      Math.max(1, Math.round(widths.of(cluster) / widths.char));
    const origin = panned ?? originOf(boundsOf(board, unit));
    const across = Math.round(origin.column * advance);
    const down = Math.round(origin.row * rowHeight);
    const column = Math.floor(across / advance);
    const row = Math.floor(down / rowHeight);
    const shift = { x: across - column * advance, y: down - row * rowHeight };
    const screen = screenOf({
      board,
      unit,
      view: {
        column,
        row,
        columns: Math.ceil((pixelWidth + shift.x) / advance),
        rows: Math.ceil((pixelHeight + shift.y) / rowHeight),
      },
      cellsOf,
    });
    cells.frame.reset();
    cells.under.reset();
    const kinds = new Map(look.kinds);
    for (const kind of [...screen.kinds, ...screen.lineKinds]) {
      if (kind?.startsWith('#') === true && !kinds.has(kind)) {
        kinds.set(kind, this.computedColor(kind));
      }
    }
    const drawing: TextDrawing = {
      tiles,
      frame: cells.frame,
      palette: paletteOf({ ...look, kinds }),
      widths,
      blanks: false,
      first: 0,
      left: -shift.x,
      limit: screen.columns,
      dot: dotBoxOf(undefined, ratio, rowHeight),
    };
    drawText(drawing, screen, rowHeight, shift.y);
    drawDots(cells, screen, shift, {
      advance,
      rowHeight,
      ratio,
      kinds,
      ground,
    });
    drawLines(cells, screen, shift, {
      advance,
      rowHeight,
      ratio,
      kinds,
      ground,
    });
    cells.draw();
    host.seenBoard = () => ({
      rows: screenRows(screen),
      column: screen.column,
      row: screen.row,
      origin,
      shift,
      advance,
      rowHeight,
      stroke: strokeOf(ratio),
    });
    return {
      origin,
      cell: { width: advance / ratio, height: rowHeight / ratio },
      view: { width: body.clientWidth, height: body.clientHeight },
    };
  }

  dispose(): void {
    this.host.seenBoard = undefined;
    this.surface?.dispose();
    this.surface = undefined;
  }
}

function drawText(
  drawing: TextDrawing,
  screen: Screen,
  rowHeight: number,
  above: number,
) {
  for (let row = 0; row < screen.rows; row++) {
    const y = row * rowHeight - above;
    let column = 0;
    while (column < screen.columns) {
      const at = row * screen.columns + column;
      const glyph = screen.glyphs[at];
      if (glyph === undefined || glyph === '') {
        column++;
        continue;
      }
      const kind = screen.kinds[at];
      const start = column;
      let text = '';
      while (column < screen.columns) {
        const next = row * screen.columns + column;
        const each = screen.glyphs[next];
        if (
          each === undefined ||
          (each !== '' && screen.kinds[next] !== kind)
        ) {
          break;
        }
        text += each;
        column++;
      }
      drawPieces(drawing, [{ text, kind }], start, y);
    }
  }
}

interface LineLook {
  readonly advance: number;
  readonly rowHeight: number;
  readonly ratio: number;
  readonly kinds: ReadonlyMap<string, string>;
  readonly ground: Rgba;
}

function drawDots(
  cells: CellSurface,
  screen: Screen,
  shift: { readonly x: number; readonly y: number },
  { advance, rowHeight, ratio, kinds, ground }: LineLook,
): void {
  const css = kinds.get(gridKind);
  if (css === undefined) {
    return;
  }
  const color = packedOf(over(ground, parsedColor(css)));
  const stroke = strokeOf(ratio);
  for (const { column, row } of gridDots(screen)) {
    cells.frame.rect(
      column * advance - shift.x,
      row * rowHeight - shift.y,
      stroke,
      stroke,
      color,
    );
  }
}

function drawLines(
  cells: CellSurface,
  screen: Screen,
  shift: { readonly x: number; readonly y: number },
  { advance, rowHeight, ratio, kinds, ground }: LineLook,
): void {
  const stroke = strokeOf(ratio);
  const packed = new Map<string | undefined, number>();
  const colorOf = (kind: string | undefined) => {
    let color = packed.get(kind);
    if (color === undefined) {
      const css = kinds.get(kind ?? lineKind) ?? kinds.get(lineKind) ?? '';
      color = packedOf(over(ground, parsedColor(css)));
      packed.set(kind, color);
    }
    return color;
  };
  for (let row = 0; row < screen.rows; row++) {
    for (let column = 0; column < screen.columns; column++) {
      const at = row * screen.columns + column;
      const bits = screen.lines[at] ?? 0;
      const way = screen.arrows[at];
      if (bits === 0 && way === undefined) {
        continue;
      }
      const area = {
        x: column * advance - shift.x,
        y: row * rowHeight - shift.y,
        width: advance,
        height: rowHeight,
      };
      const color = colorOf(screen.lineKinds[at]);
      const rects =
        way === undefined
          ? lineRects(area, bits, stroke)
          : arrowRects(area, way, stroke);
      for (const each of rects) {
        cells.frame.rect(each.x, each.y, each.width, each.height, color);
      }
    }
  }
}
