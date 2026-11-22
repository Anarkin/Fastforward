import type { DotLook } from '../../../lib/page/dotLook';
import { clicked } from '../../../lib/shared/keymap';
import { cellMetricsOf, textLookOf, type CellFont } from './cellLook';
import {
  cellPainting,
  paintRows,
  rowKey,
  type CellPainting,
  type ShownRows,
} from './cellPainting';
import { seenDots, seenGlyphs } from './cellsSeen';
import { CellSelecting } from './cellSelecting';
import { CellSurface } from './cellSurface';
import type { GlyphTiles } from './glyphTiles';
import { asciiJob, linesJob, rowsJob, type RowAhead } from './glyphWarmth';
import { IdleWork, pageIdling } from './idleWork';
import { viewerKeymap } from './keymap';
import type { ScreenRow } from './screenRows';
import { poolOf, type Pool } from './surfacePool';
import { paletteOf, textStyles, type DotBox } from './textCells';
import type { ColoredText } from './textColors';
import type { TextSelection } from './textSelection';

const scrollingBudget = 2;

const restingBudget = 50;

const scrollingWithin = 100;

const subpixelBelow = 1.5;

const layoutUnits = 64;

const onPixel = 1e-6;

const inLayoutUnits = (device: number) =>
  Math.round(device * layoutUnits) / layoutUnits;

const pools = new WeakMap<GPUDevice, Pool<CellSurface>>();

function surfacesOf(device: GPUDevice): Pool<CellSurface> {
  let pool = pools.get(device);
  if (pool === undefined) {
    pool = poolOf(
      () => new CellSurface(device),
      (surface) => surface.canvas.remove(),
      (surface) => surface.dispose(),
    );
    pools.set(device, pool);
  }
  return pool;
}

export interface CellViewFont {
  readonly font: CellFont;
  readonly dotLook: DotLook | undefined;
}

export interface CellViewEvents {
  readonly chosen: (copy: string | undefined) => void;
  readonly move: (rows: number) => void;
  readonly began?: () => void;
}

export interface CellPlace {
  readonly origin: () => { readonly left: number; readonly top: number };
  readonly area: () => DOMRect | undefined;
}

export interface CellViewShown {
  readonly shown: ShownRows;
  readonly columns: number;
  readonly ahead: readonly RowAhead[];
  readonly held: readonly ScreenRow[];
  readonly text: string | undefined;
  readonly colored: ColoredText | undefined;
  readonly events: CellViewEvents;
}

const noRows: readonly ScreenRow[] = [];

export const viewKey = (
  { font }: CellViewFont,
  ratio: number,
  generation: number,
): string =>
  `${font.family}|${font.char}|${font.spacing}|${ratio}|${generation}`;

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
    hairline: Math.max(1, Math.floor(ratio + onPixel)),
  };
}

export interface Nudge {
  readonly shift: number;
  readonly left: number;
  readonly top: number;
}

export function nudgeOf(left: number, top: number, ratio: number): Nudge {
  const across = inLayoutUnits(left * ratio);
  const down = inLayoutUnits(top * ratio);
  return {
    shift: across - Math.round(across),
    left: (Math.round(across) - across) / ratio,
    top: (Math.round(down) - down) / ratio,
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
  private readonly ratio = devicePixelRatio;
  private nudge: Nudge | undefined;
  private tiles: GlyphTiles;
  private painting: CellPainting;
  private readonly scheme = matchMedia('(prefers-color-scheme: dark)');
  private readonly idle: IdleWork;
  private readonly selecting: CellSelecting;
  private held = noRows;
  private events: CellViewEvents | undefined;
  private shown: ShownRows | undefined;
  private read: { text: string | undefined; colored: ColoredText | undefined } =
    { text: undefined, colored: undefined };
  private columns = 0;
  private again = 0;
  private rowsAt = 0;
  private firstRow: string | undefined;
  private budget = restingBudget;

  constructor(
    private readonly device: GPUDevice,
    generation: number,
    private readonly host: HTMLElement,
    private readonly rows: Element,
    private readonly looked: CellViewFont,
    private readonly place: CellPlace = {
      origin: () =>
        rows.parentElement?.getBoundingClientRect() ?? { left: 0, top: 0 },
      area: () => rows.parentElement?.getBoundingClientRect(),
    },
  ) {
    this.key = viewKey(looked, this.ratio, generation);
    this.surface = surfacesOf(device).taken();
    const { canvas } = this.surface;
    host.append(canvas);
    const { tiles, painting } = this.placed(this.nudged());
    this.tiles = tiles;
    this.painting = painting;
    this.scheme.addEventListener('change', this.relook);
    this.idle = new IdleWork(
      pageIdling(),
      (slice) => this.tiles.within(slice),
      () => this.tiles.flush(),
    );
    host.seenGlyphs = (cluster) =>
      seenGlyphs(
        this.surface.frame,
        this.tiles,
        cluster,
        this.shown?.first ?? 0,
      );
    host.seenDots = () => seenDots(this.painting, this.shown?.first ?? 0);
    this.selecting = new CellSelecting(host, canvas, {
      shown: () => this.shown,
      held: () => this.held,
      cell: () => this.tiles.metrics,
      area: this.place.area,
      pressedAs: (press) => clicked(viewerKeymap.selectText, press),
      changed: this.paint,
      began: () => this.events?.began?.(),
      chosen: (copy) => this.events?.chosen(copy),
      move: (by) => this.events?.move(by),
    });
    this.warm();
  }

  private nudged(): Nudge {
    const { left, top } = this.place.origin();
    return nudgeOf(left, top, this.ratio);
  }

  private placed(nudge: Nudge): {
    readonly tiles: GlyphTiles;
    readonly painting: CellPainting;
  } {
    const { surface, rows, looked, ratio } = this;
    this.nudge = nudge;
    surface.canvas.style.left = `${nudge.left}px`;
    surface.canvas.style.top = `${nudge.top}px`;
    const subpixel = ratio < subpixelBelow;
    const look = textLookOf(rows);
    const tiles = surface.measured(
      `${this.key}|${nudge.shift}|${subpixel}`,
      cellMetricsOf(rows, looked.font, ratio, nudge.shift),
      subpixel,
    );
    surface.grounded(look.ground);
    return {
      tiles,
      painting: cellPainting(
        tiles,
        surface.frame,
        paletteOf(look),
        dotBoxOf(looked.dotLook, ratio, tiles.metrics.rowHeight),
      ),
    };
  }

  private replaced(): void {
    const nudge = this.nudged();
    const before = this.nudge;
    if (
      before !== undefined &&
      before.shift === nudge.shift &&
      before.left === nudge.left &&
      before.top === nudge.top
    ) {
      return;
    }
    if (before?.shift === nudge.shift) {
      this.nudge = nudge;
      this.surface.canvas.style.left = `${nudge.left}px`;
      this.surface.canvas.style.top = `${nudge.top}px`;
      return;
    }
    const { tiles, painting } = this.placed(nudge);
    this.tiles = tiles;
    this.painting = painting;
    this.idle.clear();
    this.read = { text: undefined, colored: undefined };
    this.warm();
  }

  private warm(): void {
    this.idle.put(
      'letters',
      asciiJob(
        this.tiles,
        textStyles({ tiles: this.tiles, palette: this.painting.palette }),
      ),
    );
  }

  get selection(): TextSelection | undefined {
    return this.selecting.selection;
  }

  clearSelection(): void {
    this.selecting.clear();
  }

  show({
    shown,
    columns,
    ahead,
    held,
    text,
    colored: colors,
    events,
  }: CellViewShown): void {
    this.replaced();
    this.shown = shown;
    this.columns = columns;
    this.held = held;
    this.events = events;
    this.selecting.rowsChanged();
    this.paint();
    this.idle.put(
      'rows',
      rowsJob(
        this.painting,
        { ...shown, selection: this.selecting.selection },
        ahead,
      ),
    );
    const colored = colors?.parts.at(-1)?.done === true ? colors : undefined;
    if (
      text !== undefined &&
      (text !== this.read.text || colored !== this.read.colored)
    ) {
      this.read = { text, colored };
      this.idle.put('file', linesJob(this.painting, shown, text, colored));
    }
  }

  private readonly relook = () => {
    const look = textLookOf(this.rows);
    this.surface.grounded(look.ground);
    this.painting.palette = paletteOf(look);
    this.painting.kept.clear();
    this.idle.clear();
    this.read = { text: undefined, colored: undefined };
    this.warm();
    this.paint();
  };

  private budgetFor({ rows }: ShownRows): number {
    const [first] = rows;
    const firstRow = first === undefined ? undefined : rowKey(first);
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
    const whole = paintRows(
      this.painting,
      { ...shown, selection: this.selecting.selection },
      this.budgetFor(shown),
    );
    surface.draw();
    if (tiles.full) {
      tiles.reset();
      this.warm();
    }
    if (!whole) {
      this.again = requestAnimationFrame(this.paint);
    }
  };

  dispose(): void {
    this.host.seenGlyphs = undefined;
    this.host.seenDots = undefined;
    this.selecting.dispose();
    this.idle.clear();
    cancelAnimationFrame(this.again);
    this.scheme.removeEventListener('change', this.relook);
    surfacesOf(this.device).givenBack(this.surface);
  }
}
