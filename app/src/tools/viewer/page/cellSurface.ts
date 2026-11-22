import { cssOf, type Rgba } from './cellColors';
import { CellFrame, rectBytes, tileBytes } from './cellFrame';
import { GlyphAtlas } from './glyphAtlas';
import { GlyphTiles, type CellMetrics } from './glyphTiles';

const corner = `vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));`;

const placed = `gl_Position = vec4(at / size * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;`;

const tileVertex = `#version 300 es
layout(location = 0) in vec2 place;
layout(location = 1) in vec4 tile;
layout(location = 2) in vec4 ground;
uniform vec2 size;
out vec2 texel;
flat out vec3 under;
void main() {
  ${corner}
  vec2 at = place + corner * tile.zw;
  texel = tile.xy + corner * tile.zw;
  under = ground.rgb;
  ${placed}
}`;

const tileFragment = `#version 300 es
precision highp float;
uniform sampler2D tiles;
uniform float lighter;
in vec2 texel;
flat in vec3 under;
out vec4 color;
void main() {
  vec3 change = (texelFetch(tiles, ivec2(texel), 0).rgb - under) * lighter;
  color = vec4(max(change, 0.0), 0.0);
}`;

const rectVertex = `#version 300 es
layout(location = 0) in vec4 box;
layout(location = 1) in vec4 fill;
uniform vec2 size;
out vec4 filled;
void main() {
  ${corner}
  vec2 at = box.xy + corner * box.zw;
  filled = fill;
  ${placed}
}`;

const rectFragment = `#version 300 es
precision highp float;
in vec4 filled;
out vec4 color;
void main() {
  color = filled;
}`;

function shaderOf(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (shader === null) {
    throw new Error('No shader');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'A shader did not compile');
  }
  return shader;
}

function programOf(
  gl: WebGL2RenderingContext,
  vertex: string,
  fragment: string,
): WebGLProgram {
  const program = gl.createProgram();
  gl.attachShader(program, shaderOf(gl, gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, shaderOf(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'A program did not link');
  }
  return program;
}

const probed = new WeakMap<Document, boolean>();

export function cellsSupported(page: Document = document): boolean {
  let known = probed.get(page);
  if (known === undefined) {
    known =
      (page.createElement('canvas').getContext('webgl2') ?? null) !== null;
    probed.set(page, known);
  }
  return known;
}

export class CellSurface {
  readonly tiles: GlyphTiles;
  readonly frame = new CellFrame();
  private readonly gl: WebGL2RenderingContext;
  private readonly atlas: GlyphAtlas;
  private readonly tileProgram: WebGLProgram;
  private readonly rectProgram: WebGLProgram;
  private readonly tileArray: WebGLVertexArrayObject;
  private readonly rectArray: WebGLVertexArrayObject;
  private readonly tileBuffer: WebGLBuffer;
  private readonly rectBuffer: WebGLBuffer;
  private readonly tileSize: WebGLUniformLocation | null;
  private readonly tileLighter: WebGLUniformLocation | null;
  private readonly rectSize: WebGLUniformLocation | null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    metrics: CellMetrics,
    subpixel: boolean,
  ) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    if (gl === null) {
      throw new Error('No WebGL to draw cells with');
    }
    this.gl = gl;
    this.atlas = new GlyphAtlas(gl, metrics, subpixel);
    this.tiles = new GlyphTiles(metrics, this.atlas.size, this.atlas);
    gl.disable(gl.DEPTH_TEST);
    gl.blendFunc(gl.ONE, gl.ONE);

    this.tileProgram = programOf(gl, tileVertex, tileFragment);
    this.tileSize = gl.getUniformLocation(this.tileProgram, 'size');
    this.tileLighter = gl.getUniformLocation(this.tileProgram, 'lighter');
    this.tileArray = gl.createVertexArray();
    this.tileBuffer = gl.createBuffer();
    gl.bindVertexArray(this.tileArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tileBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.SHORT, false, tileBytes, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.SHORT, false, tileBytes, 4);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, tileBytes, 12);
    gl.vertexAttribDivisor(2, 1);

    this.rectProgram = programOf(gl, rectVertex, rectFragment);
    this.rectSize = gl.getUniformLocation(this.rectProgram, 'size');
    this.rectArray = gl.createVertexArray();
    this.rectBuffer = gl.createBuffer();
    gl.bindVertexArray(this.rectArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rectBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.SHORT, false, rectBytes, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, rectBytes, 8);
    gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);
  }

  grounded(ground: Rgba): void {
    this.canvas.style.background = cssOf(ground);
    this.gl.clearColor(ground[0] / 255, ground[1] / 255, ground[2] / 255, 1);
  }

  sized(width: number, height: number): void {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  draw(): void {
    const { gl, frame, canvas } = this;
    this.tiles.flush();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (frame.rectCount > 0) {
      gl.disable(gl.BLEND);
      gl.useProgram(this.rectProgram);
      gl.uniform2f(this.rectSize, canvas.width, canvas.height);
      gl.bindVertexArray(this.rectArray);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.rectBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Uint8Array(frame.rects, 0, frame.rectCount * rectBytes),
        gl.STREAM_DRAW,
      );
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, frame.rectCount);
    }
    if (frame.tileCount > 0) {
      gl.useProgram(this.tileProgram);
      gl.uniform2f(this.tileSize, canvas.width, canvas.height);
      gl.bindVertexArray(this.tileArray);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.tileBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Uint8Array(frame.tiles, 0, frame.tileCount * tileBytes),
        gl.STREAM_DRAW,
      );
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.atlas.texture);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.uniform1f(this.tileLighter, 1);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, frame.tileCount);
      gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
      gl.uniform1f(this.tileLighter, -1);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, frame.tileCount);
    }
    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
