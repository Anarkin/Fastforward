import { textureUsage } from './gpuDevice';
import {
  tilePadding,
  type CellMetrics,
  type GlyphPainter,
  type GlyphShape,
  type GlyphStyle,
} from './glyphTiles';

const mostTextureSize = 4096;

export class GlyphAtlas implements GlyphPainter {
  readonly size: number;
  readonly texture: GPUTexture;
  private readonly canvas: OffscreenCanvas;
  private readonly stage: OffscreenCanvasRenderingContext2D;
  private readonly padX: number;
  private readonly padY: number;
  private readonly tileHeight: number;
  private font = '';

  constructor(
    private readonly device: GPUDevice,
    private readonly metrics: CellMetrics,
  ) {
    const { padX, padY, tileHeight } = tilePadding(metrics);
    this.padX = padX;
    this.padY = padY;
    this.tileHeight = tileHeight;
    this.size = Math.min(mostTextureSize, device.limits.maxTextureDimension2D);
    this.canvas = new OffscreenCanvas(this.size, tileHeight);
    const stage = this.canvas.getContext('2d', { alpha: false });
    if (stage === null) {
      throw new Error('No 2D canvas to draw glyphs on');
    }
    this.stage = stage;
    stage.textBaseline = 'alphabetic';
    this.texture = device.createTexture({
      size: [this.size, this.size],
      format: 'rgba8unorm',
      usage:
        textureUsage.textureBinding |
        textureUsage.copyDst |
        textureUsage.renderAttachment,
    });
  }

  dispose(): void {
    this.texture.destroy();
  }

  paint(
    style: GlyphStyle,
    shown: string,
    x: number,
    width: number,
    { cells, centered, scale }: GlyphShape,
  ): void {
    const { stage } = this;
    const { advance, baseline, spacing, shift, fontAt } = this.metrics;
    stage.fillStyle = style.ground;
    stage.fillRect(x, 0, width, this.tileHeight);
    const font = fontAt(scale);
    if (font !== this.font) {
      stage.font = font;
      this.font = font;
    }
    const left = centered
      ? (cells * advance - (stage.measureText(shown).width + spacing)) / 2
      : 0;
    stage.fillStyle = style.ink;
    stage.fillText(shown, x + this.padX + shift + left, this.padY + baseline);
  }

  upload(shelf: number): void {
    this.device.queue.copyExternalImageToTexture(
      { source: this.canvas },
      { texture: this.texture, origin: [0, shelf] },
      [this.size, this.tileHeight],
    );
  }
}
