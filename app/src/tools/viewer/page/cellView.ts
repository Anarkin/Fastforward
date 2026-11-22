import type { DotLook } from '../../../lib/page/dotLook';
import { cellMetricsOf, textLookOf, type CellFont } from './cellLook';
import {
  cellPainting,
  paintRows,
  type CellPainting,
  type ShownRows,
} from './cellPainting';
import { CellSurface } from './cellSurface';
import { paletteOf, type DotBox } from './textCells';

const scrollingBudget = 2;

const restingBudget = 50;

const scrollingWithin = 100;

const subpixelBelow = 1.5;

const layoutUnits = 64;

const onPixel = 1e-6;

const inLayoutUnits = (device: number) =>
  Math.round(device * layoutUnits) / layoutUnits;

export interface CellViewFont {
  readonly font: CellFont;
  readonly dotLook: DotLook | undefined;
}

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
  private readonly surface: CellSurface;
  private readonly painting: CellPainting;
  private readonly scheme = matchMedia('(prefers-color-scheme: dark)');
  private shown: ShownRows | undefined;
  private columns = 0;
  private again = 0;
  private rowsAt = 0;
  private firstRow: string | undefined;
  private budget = restingBudget;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly host: Element,
    { font, dotLook }: CellViewFont,
  ) {
    const ratio = devicePixelRatio;
    const area = host.parentElement?.getBoundingClientRect();
    const left = inLayoutUnits((area?.left ?? 0) * ratio);
    const top = inLayoutUnits((area?.top ?? 0) * ratio);
    const shift = left - Math.round(left);
    canvas.style.left = `${-shift / ratio}px`;
    canvas.style.top = `${(Math.round(top) - top) / ratio}px`;
    const look = textLookOf(host);
    this.surface = new CellSurface(
      canvas,
      cellMetricsOf(host, font, ratio, shift),
      ratio < subpixelBelow,
    );
    this.surface.grounded(look.ground);
    this.painting = cellPainting(
      this.surface.tiles,
      this.surface.frame,
      paletteOf(look),
      dotBoxOf(dotLook, ratio, this.surface.tiles.metrics.rowHeight),
    );
    this.scheme.addEventListener('change', this.relook);
  }

  show(shown: ShownRows, columns: number): void {
    this.shown = shown;
    this.columns = columns;
    this.paint();
  }

  private readonly relook = () => {
    const look = textLookOf(this.host);
    this.surface.grounded(look.ground);
    this.surface.tiles.restyled();
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
    const { shown, surface } = this;
    if (shown === undefined) {
      return;
    }
    const { advance, rowHeight } = surface.tiles.metrics;
    surface.sized(this.columns * advance, shown.rows.length * rowHeight);
    const whole = paintRows(this.painting, shown, this.budgetFor(shown));
    surface.draw();
    if (surface.tiles.full) {
      surface.tiles.reset();
    }
    if (!whole) {
      this.again = requestAnimationFrame(this.paint);
    }
  };

  dispose(): void {
    cancelAnimationFrame(this.again);
    this.scheme.removeEventListener('change', this.relook);
    this.surface.dispose();
  }
}
