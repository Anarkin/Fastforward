import type { CellFrame } from './cellFrame';
import { CellSurface } from './cellSurface';
import { gpuDevice } from './gpuDevice';
import { RunAtlas } from './runAtlas';
import type { RowPaint } from './runText';
import type { Shape } from './shapeLayer';

export interface RowRecord extends RowPaint {
  readonly sign: string;
}

export interface ListView {
  readonly cells: CellSurface;
  readonly runs: RunAtlas;
  readonly scale: number;
  readonly width: number;
  readonly origin: number;
  readonly viewHeight: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly originPixels: number;
  readonly shiftX: number;
}

export interface ShownRow<Row extends RowRecord> {
  readonly row: Row;
  readonly pinned: boolean;
}

export type Presented = 'drawn' | 'same' | 'full';

export function drawnWithRoom(frame: () => Presented | undefined): void {
  if (frame() === 'full') {
    frame();
  }
}

const tileStride = 7;

const layoutUnits = 64;

export const laidOut = (device: number) =>
  Math.round(device * layoutUnits) / layoutUnits;

function replay(row: RowPaint, originPixels: number, into: CellFrame): void {
  const { rects, tiles } = row;
  for (let at = 0; at < rects.length; at += 5) {
    into.rect(
      rects[at] ?? 0,
      (rects[at + 1] ?? 0) - originPixels,
      rects[at + 2] ?? 0,
      rects[at + 3] ?? 0,
      rects[at + 4] ?? 0,
    );
  }
  for (let at = 0; at < tiles.length; at += tileStride) {
    into.tile(
      tiles[at] ?? 0,
      (tiles[at + 1] ?? 0) - originPixels,
      tiles[at + 2] ?? 0,
      tiles[at + 3] ?? 0,
      tiles[at + 4] ?? 0,
      tiles[at + 5] ?? 0,
      tiles[at + 6] ?? 0,
    );
  }
}

export class ListCanvas<Row extends RowRecord> {
  private surface: CellSurface | undefined;
  private atlas: RunAtlas | undefined;
  private kept:
    | {
        readonly key: string;
        readonly owner: unknown;
        readonly rows: Map<string, Row>;
      }
    | undefined;
  private last:
    | {
        readonly surface: CellSurface;
        readonly key: string;
        readonly rows: readonly Row[];
      }
    | undefined;

  constructor(private readonly className: string) {}

  viewOf(
    host: HTMLElement,
    list: HTMLElement,
    scale: number,
    tileHeight: number,
  ): ListView | undefined {
    const device = gpuDevice();
    if (device === undefined) {
      return undefined;
    }
    if (this.surface?.device !== device) {
      this.surface?.dispose();
      this.atlas?.dispose();
      this.surface = new CellSurface(device);
      this.surface.canvas.className = this.className;
      host.append(this.surface.canvas);
      this.atlas = undefined;
    }
    if (this.atlas?.tileHeight !== tileHeight) {
      this.atlas?.dispose();
      this.atlas = new RunAtlas(device, tileHeight);
    }
    const spacer = (host.parentElement ?? list).getBoundingClientRect();
    const across = laidOut(spacer.left * scale);
    const box = list.getBoundingClientRect();
    const width = spacer.width;
    const origin = box.top + list.clientTop - spacer.top;
    const viewHeight = Math.min(list.clientHeight, spacer.height);
    const pixelWidth = Math.round(width * scale);
    const pixelHeight = Math.ceil(viewHeight * scale);
    host.style.display = '';
    host.style.width = `${pixelWidth / scale}px`;
    host.style.height = `${pixelHeight / scale}px`;
    host.style.marginBottom = `${-pixelHeight / scale}px`;
    const cells = this.surface;
    cells.sized(pixelWidth, pixelHeight);
    cells.texturedBy(this.atlas.texture);
    return {
      cells,
      runs: this.atlas,
      scale,
      width,
      origin,
      viewHeight,
      pixelWidth,
      pixelHeight,
      originPixels: Math.round(origin * scale),
      shiftX: across - Math.round(across),
    };
  }

  rowsFor(key: string, owner: unknown): Map<string, Row> {
    const full = `${key} ${this.atlas?.generation ?? 0}`;
    if (this.kept?.key !== full || this.kept.owner !== owner) {
      this.kept = { key: full, owner, rows: new Map() };
    }
    return this.kept.rows;
  }

  present(
    view: ListView,
    shown: readonly ShownRow<Row>[],
    frameKey: string,
    finish: (cells: CellSurface) => void = () => {},
    shapes: readonly Shape[] = [],
  ): Presented {
    const { cells, runs, originPixels } = view;
    cells.frame.reset();
    cells.under.reset();
    const key = `${frameKey} ${runs.generation}`;
    const before = this.last;
    if (
      before !== undefined &&
      before.surface === cells &&
      before.key === key &&
      before.rows.length === shown.length &&
      before.rows.every((row, at) => row === shown[at]?.row)
    ) {
      return 'same';
    }
    this.last = { surface: cells, key, rows: shown.map((each) => each.row) };
    for (const each of shown) {
      replay(
        each.row,
        each.pinned ? 0 : originPixels,
        each.pinned ? cells.under : cells.frame,
      );
    }
    finish(cells);
    if (runs.full) {
      runs.reset();
      this.kept = undefined;
      this.last = undefined;
      return 'full';
    }
    runs.flush();
    cells.shaped(shapes, 0);
    cells.draw();
    return 'drawn';
  }

  dispose(): void {
    this.surface?.dispose();
    this.atlas?.dispose();
    this.surface = undefined;
    this.atlas = undefined;
    this.kept = undefined;
    this.last = undefined;
  }
}
