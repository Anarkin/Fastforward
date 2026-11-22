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
  texture: WebGLTexture;
  private readonly canvas: OffscreenCanvas;
  private readonly stage: OffscreenCanvasRenderingContext2D;
  private readonly padX: number;
  private readonly padY: number;
  private readonly tileHeight: number;
  private font = '';

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly metrics: CellMetrics,
    subpixel: boolean,
  ) {
    const { padX, padY, tileHeight } = tilePadding(metrics);
    this.padX = padX;
    this.padY = padY;
    this.tileHeight = tileHeight;
    this.size = Math.min(
      mostTextureSize,
      Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
    );
    this.canvas = new OffscreenCanvas(this.size, tileHeight);
    const stage = this.canvas.getContext('2d', { alpha: !subpixel });
    if (stage === null) {
      throw new Error('No 2D canvas to draw glyphs on');
    }
    this.stage = stage;
    stage.textBaseline = 'alphabetic';
    this.texture = this.textured();
  }

  textured(): WebGLTexture {
    const { gl } = this;
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, this.size, this.size);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return this.texture;
  }

  dispose(): void {
    this.gl.deleteTexture(this.texture);
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
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      shelf,
      this.size,
      this.tileHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.canvas,
    );
  }
}
