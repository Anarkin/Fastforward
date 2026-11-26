import { textureUsage } from './gpuDevice';

export interface RunStyle {
  readonly key: string;
  readonly font: string;
  readonly ink: string;
  readonly ground: string;
  readonly baseline: number;
  readonly strike?: { readonly top: number; readonly thickness: number };
}

export interface RunTile {
  readonly u: number;
  readonly v: number;
  readonly width: number;
}

const mostTextureSize = 4096;

const mostMeasured = 20_000;

export const runPadding = 2;

const layoutUnits = 64;

export function offsetOf(x: number): number {
  return Math.round((x - Math.floor(x)) * layoutUnits) / layoutUnits;
}

export class RunAtlas {
  readonly size: number;
  readonly texture: GPUTexture;
  generation = 0;
  full = false;
  textScale = 1;
  private readonly shelf: OffscreenCanvas;
  private readonly stage: OffscreenCanvasRenderingContext2D;
  private readonly measuring: OffscreenCanvasRenderingContext2D;
  private readonly tiles = new Map<string, RunTile>();
  private readonly widths = new Map<string, number>();
  private shelfX = 0;
  private shelfY = 0;
  private waiting = false;
  private font = '';
  private measuredFont = '';

  constructor(
    private readonly device: GPUDevice,
    readonly tileHeight: number,
  ) {
    this.size = Math.min(mostTextureSize, device.limits.maxTextureDimension2D);
    this.shelf = new OffscreenCanvas(this.size, tileHeight);
    const stage = this.shelf.getContext('2d', { alpha: false });
    const measuring = new OffscreenCanvas(1, 1).getContext('2d');
    if (stage === null || measuring === null) {
      throw new Error('No 2D canvas to draw text on');
    }
    stage.textBaseline = 'alphabetic';
    this.stage = stage;
    this.measuring = measuring;
    this.texture = device.createTexture({
      size: [this.size, this.size],
      format: 'rgba8unorm',
      usage:
        textureUsage.textureBinding |
        textureUsage.copyDst |
        textureUsage.renderAttachment,
    });
  }

  measure(text: string, font: string): number {
    const key = `${font}\u0000${text}`;
    const known = this.widths.get(key);
    if (known !== undefined) {
      return known * this.textScale;
    }
    if (this.measuredFont !== font) {
      this.measuring.font = font;
      this.measuredFont = font;
    }
    const width = this.measuring.measureText(text).width;
    if (this.widths.size >= mostMeasured) {
      this.widths.clear();
    }
    this.widths.set(key, width);
    return width * this.textScale;
  }

  tile(text: string, style: RunStyle, offset: number): RunTile | undefined {
    const key = `${style.key}\u0000${this.textScale}\u0000${offset}\u0000${text}`;
    const known = this.tiles.get(key);
    if (known !== undefined) {
      return known;
    }
    if (this.full) {
      return undefined;
    }
    const width =
      Math.ceil(this.measure(text, style.font) + offset) + 2 * runPadding;
    if (width > this.size) {
      return undefined;
    }
    if (this.shelfX + width > this.size) {
      this.flush();
      this.shelfX = 0;
      this.shelfY += this.tileHeight;
    }
    if (this.shelfY + this.tileHeight > this.size) {
      this.full = true;
      return undefined;
    }
    const x = this.shelfX;
    this.shelfX += width;
    const { stage } = this;
    stage.fillStyle = style.ground;
    stage.fillRect(x, 0, width, this.tileHeight);
    if (this.font !== style.font) {
      stage.font = style.font;
      this.font = style.font;
    }
    stage.fillStyle = style.ink;
    if (this.textScale === 1) {
      stage.fillText(text, x + runPadding + offset, style.baseline);
    } else {
      stage.save();
      stage.translate(x + runPadding + offset, style.baseline);
      stage.scale(this.textScale, this.textScale);
      stage.fillText(text, 0, 0);
      stage.restore();
    }
    if (style.strike !== undefined) {
      const left = x + runPadding + Math.round(offset);
      stage.fillRect(
        left,
        style.strike.top,
        x +
          runPadding +
          Math.round(offset + this.measure(text, style.font)) -
          left,
        style.strike.thickness,
      );
    }
    this.waiting = true;
    const tile = { u: x, v: this.shelfY, width };
    this.tiles.set(key, tile);
    return tile;
  }

  painted(
    key: string,
    width: number,
    ground: string,
    paint: (context: OffscreenCanvasRenderingContext2D) => void,
  ): RunTile | undefined {
    const known = this.tiles.get(key);
    if (known !== undefined) {
      return known;
    }
    if (this.full || width > this.size || width <= 0) {
      return undefined;
    }
    if (this.shelfX + width > this.size) {
      this.flush();
      this.shelfX = 0;
      this.shelfY += this.tileHeight;
    }
    if (this.shelfY + this.tileHeight > this.size) {
      this.full = true;
      return undefined;
    }
    const x = this.shelfX;
    this.shelfX += width;
    const { stage } = this;
    stage.fillStyle = ground;
    stage.fillRect(x, 0, width, this.tileHeight);
    stage.save();
    stage.beginPath();
    stage.rect(x, 0, width, this.tileHeight);
    stage.clip();
    stage.translate(x, 0);
    paint(stage);
    stage.restore();
    this.font = '';
    this.waiting = true;
    const tile = { u: x, v: this.shelfY, width };
    this.tiles.set(key, tile);
    return tile;
  }

  flush(): void {
    if (this.waiting) {
      this.device.queue.copyExternalImageToTexture(
        { source: this.shelf },
        { texture: this.texture, origin: [0, this.shelfY] },
        [this.size, this.tileHeight],
      );
      this.waiting = false;
    }
  }

  reset(): void {
    this.tiles.clear();
    this.shelfX = 0;
    this.shelfY = 0;
    this.full = false;
    this.waiting = false;
    this.generation++;
  }

  dispose(): void {
    this.texture.destroy();
  }
}
