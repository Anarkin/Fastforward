import type { DotLook } from '../../../lib/page/dotLook';
import { cellMetricsOf, textLookOf, type CellFont } from './cellLook';
import {
  cellPainting,
  paintRows,
  type CellPainting,
  type ShownRows,
} from './cellPainting';
import { CellSurface } from './cellSurface';
import type { GlyphTiles } from './glyphTiles';
import { poolOf } from './surfacePool';
import { paletteOf, type DotBox } from './textCells';

const scrollingBudget = 2;

const restingBudget = 50;

const scrollingWithin = 100;

const subpixelBelow = 1.5;

const layoutUnits = 64;

const onPixel = 1e-6;

const inLayoutUnits = (device: number) =>
  Math.round(device * layoutUnits) / layoutUnits;

const surfaces = poolOf(
  () => new CellSurface(),
  (surface) => {
    surface.onRestored = undefined;
    surface.canvas.remove();
  },
  (surface) => surface.dispose(),
);

export interface CellViewFont {
  readonly font: CellFont;
  readonly dotLook: DotLook | undefined;
}

export const viewKey = ({ font }: CellViewFont, ratio: number): string =>
  `${font.family}|${font.char}|${font.spacing}|${ratio}`;

export function dotBoxOf(
  dotLook: DotLook | undefined,
  ratio: number,
  rowHeight: number,
): DotBox {
  const size = Math.max(1, Math.round((dotLook?.dot ?? 0) * ratio));
  return {
    size,
    left: Math.round((dotLook?.start ?? 0) * ratio),
    top: Math.floor((rowHeight - size) / 2 + onPixel),
  };
}

export function rasterBudget(
  sinceRowsChanged: number,
  rowsChanged: boolean,
  before: number,
): number {
  if (!rowsChanged) {
    return before;
  }
  return sinceRowsChanged < scrollingWithin ? scrollingBudget : restingBudget;
}

export class CellView {
  readonly key: string;
  private readonly surface: CellSurface;
  private readonly tiles: GlyphTiles;
  private readonly painting: CellPainting;
  private readonly scheme = matchMedia('(prefers-color-scheme: dark)');
  private shown: ShownRows | undefined;
  private columns = 0;
  private again = 0;
  private rowsAt = 0;
  private firstRow: string | undefined;
  private budget = restingBudget;

  constructor(
    private readonly host: HTMLElement,
    private readonly rows: Element,
    looked: CellViewFont,
  ) {
    const ratio = devicePixelRatio;
    this.key = viewKey(looked, ratio);
    const area = rows.parentElement?.getBoundingClientRect();
    const left = inLayoutUnits((area?.left ?? 0) * ratio);
    const top = inLayoutUnits((area?.top ?? 0) * ratio);
    const shift = left - Math.round(left);
    const subpixel = ratio < subpixelBelow;
    this.surface = surfaces.taken();
    const { canvas } = this.surface;
    canvas.style.left = `${-shift / ratio}px`;
    canvas.style.top = `${(Math.round(top) - top) / ratio}px`;
    host.append(canvas);
    const look = textLookOf(rows);
    this.tiles = this.surface.measured(
      `${this.key}|${shift}|${subpixel}`,
      cellMetricsOf(rows, looked.font, ratio, shift),
      subpixel,
    );
    this.surface.grounded(look.ground);
    this.painting = cellPainting(
      this.tiles,
      this.surface.frame,
      paletteOf(look),
      dotBoxOf(looked.dotLook, ratio, this.tiles.metrics.rowHeight),
    );
    this.surface.onRestored = this.paint;
    this.scheme.addEventListener('change', this.relook);
  }

  show(shown: ShownRows, columns: number): void {
    this.shown = shown;
    this.columns = columns;
    this.paint();
  }

  private readonly relook = () => {
    const look = textLookOf(this.rows);
    this.surface.grounded(look.ground);
    this.tiles.restyled();
    this.painting.palette = paletteOf(look);
    this.painting.kept.clear();
    this.paint();
  };

  private budgetFor({ rows }: ShownRows): number {
    const [first] = rows;
    const firstRow =
      first === undefined ? undefined : `${first.row.start}:${first.from}`;
    const now = performance.now();
    const changed = firstRow !== this.firstRow;
    this.budget = rasterBudget(now - this.rowsAt, changed, this.budget);
    if (changed) {
      this.rowsAt = now;
      this.firstRow = firstRow;
    }
    return this.budget;
  }

  private readonly paint = () => {
    cancelAnimationFrame(this.again);
    const { shown, surface, tiles } = this;
    if (shown === undefined) {
      return;
    }
    const { advance, rowHeight } = tiles.metrics;
    surface.sized(this.columns * advance, shown.rows.length * rowHeight);
    const whole = paintRows(this.painting, shown, this.budgetFor(shown));
    surface.draw();
    if (tiles.full) {
      tiles.reset();
    }
    if (!whole) {
      this.again = requestAnimationFrame(this.paint);
    }
  };

  dispose(): void {
    cancelAnimationFrame(this.again);
    this.scheme.removeEventListener('change', this.relook);
    surfaces.givenBack(this.surface);
  }
}
