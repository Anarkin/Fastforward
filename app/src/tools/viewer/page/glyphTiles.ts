import { cssOf, packedOf, type Rgba } from './cellColors';

export interface CellMetrics {
  readonly advance: number;
  readonly rowHeight: number;
  readonly baseline: number;
  readonly spacing: number;
  readonly shift: number;
  readonly fontAt: (scale: number) => string;
}

export interface GlyphStyle {
  readonly ink: string;
  readonly ground: string;
  readonly packed: number;
  readonly ascii: Int32Array;
  readonly others: Map<string, number>;
}

export interface GlyphShape {
  readonly cells: number;
  readonly centered: boolean;
  readonly scale: number;
}

export interface GlyphPainter {
  paint(
    style: GlyphStyle,
    shown: string,
    x: number,
    width: number,
    shape: GlyphShape,
  ): void;
  upload(shelf: number): void;
}

const unknown = -1;

export const notDrawn = -2;

const asciiCodes = 128;

const alone: GlyphShape = { cells: 1, centered: false, scale: 1 };

function grownShorts(kept: Uint16Array): Uint16Array<ArrayBuffer> {
  const larger = new Uint16Array(kept.length * 2);
  larger.set(kept);
  return larger;
}

function grownBytes(kept: Uint8Array): Uint8Array<ArrayBuffer> {
  const larger = new Uint8Array(kept.length * 2);
  larger.set(kept);
  return larger;
}

export function tilePadding(metrics: CellMetrics): {
  readonly padX: number;
  readonly padY: number;
  readonly tileHeight: number;
} {
  const padX = Math.ceil(metrics.advance / 2);
  const padY = Math.ceil(metrics.rowHeight / 4);
  return { padX, padY, tileHeight: metrics.rowHeight + 2 * padY };
}

export class GlyphTiles {
  readonly padX: number;
  readonly padY: number;
  readonly tileHeight: number;
  us = new Uint16Array(4096);
  vs = new Uint16Array(4096);
  widths = new Uint16Array(4096);
  cells = new Uint8Array(4096);
  count = 0;
  generation = 0;
  full = false;
  private until = Infinity;
  private readonly styles = new Map<string, GlyphStyle>();
  private shelfX = 0;
  private shelfY = 0;
  private waiting = false;

  constructor(
    readonly metrics: CellMetrics,
    private readonly size: number,
    private readonly painter: GlyphPainter,
    private readonly now: () => number = () => performance.now(),
  ) {
    const { padX, padY, tileHeight } = tilePadding(metrics);
    this.padX = padX;
    this.padY = padY;
    this.tileHeight = tileHeight;
  }

  style(ink: string, ground: Rgba): GlyphStyle {
    const key = `${ink}|${ground.join(',')}`;
    let style = this.styles.get(key);
    if (style === undefined) {
      style = {
        ink,
        ground: cssOf(ground),
        packed: packedOf(ground),
        ascii: new Int32Array(asciiCodes).fill(unknown),
        others: new Map(),
      };
      this.styles.set(key, style);
    }
    return style;
  }

  ascii(style: GlyphStyle, code: number): number {
    const known = style.ascii[code];
    if (known !== unknown) {
      return known;
    }
    const tile = this.drawn(style, String.fromCharCode(code), alone);
    if (tile !== notDrawn) {
      style.ascii[code] = tile;
    }
    return tile;
  }

  known(style: GlyphStyle, cluster: string): number | undefined {
    return style.others.get(cluster);
  }

  tilesOf(cluster: string): number[] {
    const code = cluster.length === 1 ? cluster.charCodeAt(0) : asciiCodes;
    return [...this.styles.values()]
      .map(
        (style) =>
          style.others.get(cluster) ??
          (code < asciiCodes ? style.ascii[code] : unknown),
      )
      .filter((tile) => tile >= 0);
  }

  glyph(
    style: GlyphStyle,
    cluster: string,
    shown: string,
    shape: GlyphShape,
  ): number {
    const tile = this.drawn(style, shown, shape);
    if (tile !== notDrawn) {
      style.others.set(cluster, tile);
    }
    return tile;
  }

  private drawn(style: GlyphStyle, shown: string, shape: GlyphShape): number {
    if (this.full || this.now() > this.until) {
      return notDrawn;
    }
    const width =
      Math.max(1, shape.cells) * this.metrics.advance + 2 * this.padX;
    if (this.shelfX + width > this.size) {
      this.flush();
      this.shelfX = 0;
      this.shelfY += this.tileHeight;
    }
    if (this.shelfY + this.tileHeight > this.size) {
      this.full = true;
      return notDrawn;
    }
    const x = this.shelfX;
    this.shelfX += width;
    this.painter.paint(style, shown, x, width, shape);
    const tile = this.count++;
    if (tile >= this.us.length) {
      this.us = grownShorts(this.us);
      this.vs = grownShorts(this.vs);
      this.widths = grownShorts(this.widths);
      this.cells = grownBytes(this.cells);
    }
    this.us[tile] = x;
    this.vs[tile] = this.shelfY;
    this.widths[tile] = width;
    this.cells[tile] = shape.cells;
    this.waiting = true;
    return tile;
  }

  get filled(): number {
    return Math.min(1, (this.shelfY + this.tileHeight) / this.size);
  }

  within(budget: number): void {
    this.until = this.now() + budget;
  }

  flush(): void {
    if (this.waiting) {
      this.painter.upload(this.shelfY);
      this.waiting = false;
    }
  }

  reset(): void {
    for (const style of this.styles.values()) {
      style.ascii.fill(unknown);
      style.others.clear();
    }
    this.count = 0;
    this.generation++;
    this.shelfX = 0;
    this.shelfY = 0;
    this.full = false;
    this.waiting = false;
  }

  restyled(): void {
    this.styles.clear();
    this.reset();
  }
}
