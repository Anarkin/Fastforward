import { cssOf, type Rgba } from './cellColors';
import { CellFrame, rectBytes, tileBytes } from './cellFrame';
import { GlyphAtlas } from './glyphAtlas';
import { GlyphTiles, type CellMetrics } from './glyphTiles';
import { bufferUsage, isGpuContext, shaderStage } from './gpuDevice';

const placed = `
  var out: Placed;
  out.position = vec4f(
    at.x / view.size.x * 2.0 - 1.0,
    1.0 - at.y / view.size.y * 2.0,
    0.0,
    1.0,
  );`;

const pulled = `
@group(1) @binding(0) var<storage, read> records: array<u32>;

fn low(word: u32) -> f32 {
  return f32(bitcast<i32>(word << 16u) >> 16u);
}

fn high(word: u32) -> f32 {
  return f32(bitcast<i32>(word) >> 16u);
}

fn pair(word: u32) -> vec2f {
  return vec2f(low(word), high(word));
}

fn corner(vertex: u32) -> vec2f {
  var corners = array<u32, 6>(0u, 1u, 2u, 2u, 1u, 3u);
  let turned = corners[vertex % 6u];
  return vec2f(f32(turned & 1u), f32(turned >> 1u));
}`;

const rectShader = `
struct View { size: vec2f };
@group(0) @binding(0) var<uniform> view: View;
${pulled}

struct Placed {
  @builtin(position) position: vec4f,
  @location(0) @interpolate(flat) fill: vec4f,
};

@vertex fn placedRect(@builtin(vertex_index) vertex: u32) -> Placed {
  let record = vertex / 6u * ${rectBytes / 4}u;
  let at = pair(records[record]) + corner(vertex) * pair(records[record + 1u]);
  ${placed}
  out.fill = unpack4x8unorm(records[record + 2u]);
  return out;
}

@fragment fn filled(rect: Placed) -> @location(0) vec4f {
  return vec4f(rect.fill.rgb, 1.0);
}`;

const tileShader = `
struct View { size: vec2f };
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var tiles: texture_2d<f32>;
${pulled}

override lighter: f32 = 1.0;

struct Placed {
  @builtin(position) position: vec4f,
  @location(0) texel: vec2f,
  @location(1) @interpolate(flat) under: vec3f,
};

@vertex fn placedTile(@builtin(vertex_index) vertex: u32) -> Placed {
  let record = vertex / 6u * ${tileBytes / 4}u;
  let reach = corner(vertex) * pair(records[record + 2u]);
  let at = pair(records[record]) + reach;
  ${placed}
  out.texel = pair(records[record + 1u]) + reach;
  out.under = unpack4x8unorm(records[record + 3u]).rgb;
  return out;
}

@fragment fn changed(tile: Placed) -> @location(0) vec4f {
  let drawn = textureLoad(tiles, vec2<i32>(tile.texel), 0).rgb;
  return vec4f(max((drawn - tile.under) * lighter, vec3f(0.0)), 0.0);
}`;

const firstRoom = 1 << 16;

const addedTo: GPUBlendComponent = {
  operation: 'add',
  srcFactor: 'one',
  dstFactor: 'one',
};

const takenFrom: GPUBlendComponent = {
  operation: 'reverse-subtract',
  srcFactor: 'one',
  dstFactor: 'one',
};

const kept: GPUBlendComponent = {
  operation: 'add',
  srcFactor: 'zero',
  dstFactor: 'one',
};

const cornersOfEach = 6;

interface Glyphs {
  readonly key: string;
  readonly atlas: GlyphAtlas;
  readonly tiles: GlyphTiles;
  users: number;
}

interface Measured {
  readonly glyphs: Glyphs;
  readonly group: GPUBindGroup;
}

interface Room {
  buffer: GPUBuffer;
  group: GPUBindGroup;
  size: number;
}

const sparesKept = 1;

class CellDrawing {
  readonly format = navigator.gpu.getPreferredCanvasFormat();
  readonly rects: GPURenderPipeline;
  readonly lighter: GPURenderPipeline;
  readonly darker: GPURenderPipeline;
  readonly rectGroups: GPUBindGroupLayout;
  readonly tileGroups: GPUBindGroupLayout;
  readonly recordGroups: GPUBindGroupLayout;
  private readonly glyphs = new Map<string, Glyphs>();

  constructor(private readonly device: GPUDevice) {
    const { format } = this;
    const sized: GPUBindGroupLayoutEntry = {
      binding: 0,
      visibility: shaderStage.vertex,
      buffer: {},
    };
    this.rectGroups = device.createBindGroupLayout({ entries: [sized] });
    this.tileGroups = device.createBindGroupLayout({
      entries: [
        sized,
        { binding: 1, visibility: shaderStage.fragment, texture: {} },
      ],
    });
    this.recordGroups = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: shaderStage.vertex,
          buffer: { type: 'read-only-storage' },
        },
      ],
    });
    const rectModule = device.createShaderModule({ code: rectShader });
    const tileModule = device.createShaderModule({ code: tileShader });
    this.rects = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.rectGroups, this.recordGroups],
      }),
      vertex: { module: rectModule },
      fragment: { module: rectModule, targets: [{ format }] },
    });
    const tiled = device.createPipelineLayout({
      bindGroupLayouts: [this.tileGroups, this.recordGroups],
    });
    const blended = (
      color: GPUBlendComponent,
      lighter: number,
    ): GPURenderPipeline =>
      device.createRenderPipeline({
        layout: tiled,
        vertex: { module: tileModule },
        fragment: {
          module: tileModule,
          constants: { lighter },
          targets: [{ format, blend: { color, alpha: kept } }],
        },
      });
    this.lighter = blended(addedTo, 1);
    this.darker = blended(takenFrom, -1);
  }

  taken(key: string, metrics: CellMetrics, subpixel: boolean): Glyphs {
    let glyphs = this.glyphs.get(key);
    if (glyphs === undefined) {
      const atlas = new GlyphAtlas(this.device, metrics, subpixel);
      glyphs = {
        key,
        atlas,
        tiles: new GlyphTiles(metrics, atlas.size, atlas),
        users: 0,
      };
    }
    this.glyphs.delete(key);
    this.glyphs.set(key, glyphs);
    glyphs.users++;
    return glyphs;
  }

  left(glyphs: Glyphs): void {
    glyphs.users--;
    const unused = [...this.glyphs.values()].filter(({ users }) => users === 0);
    for (const spare of unused.slice(0, -sparesKept)) {
      spare.atlas.dispose();
      this.glyphs.delete(spare.key);
    }
  }
}

const drawings = new WeakMap<GPUDevice, CellDrawing>();

function drawingOf(device: GPUDevice): CellDrawing {
  let drawing = drawings.get(device);
  if (drawing === undefined) {
    drawing = new CellDrawing(device);
    drawings.set(device, drawing);
  }
  return drawing;
}

export class CellSurface {
  readonly canvas: HTMLCanvasElement;
  readonly frame = new CellFrame();
  private readonly context: GPUCanvasContext;
  private readonly drawing: CellDrawing;
  private readonly view: GPUBuffer;
  private readonly rectGroup: GPUBindGroup;
  private readonly rectRoom: Room;
  private readonly tileRoom: Room;
  private measure: Measured | undefined;
  private ground: Rgba = [0, 0, 0, 1];

  constructor(
    private readonly device: GPUDevice,
    page: Document = document,
  ) {
    this.canvas = page.createElement('canvas');
    this.canvas.className = 'cell-canvas';
    const context: unknown = this.canvas.getContext('webgpu');
    if (!isGpuContext(context)) {
      throw new Error('No WebGPU to draw cells with');
    }
    this.context = context;
    this.drawing = drawingOf(device);
    context.configure({
      device,
      format: this.drawing.format,
      alphaMode: 'opaque',
    });
    this.view = device.createBuffer({
      size: 16,
      usage: bufferUsage.uniform | bufferUsage.copyDst,
    });
    this.rectGroup = device.createBindGroup({
      layout: this.drawing.rectGroups,
      entries: [{ binding: 0, resource: { buffer: this.view } }],
    });
    this.rectRoom = this.roomOf(firstRoom);
    this.tileRoom = this.roomOf(firstRoom);
  }

  private roomOf(size: number): Room {
    const buffer = this.device.createBuffer({
      size,
      usage: bufferUsage.storage | bufferUsage.copyDst,
    });
    return {
      size,
      buffer,
      group: this.device.createBindGroup({
        layout: this.drawing.recordGroups,
        entries: [{ binding: 0, resource: { buffer } }],
      }),
    };
  }

  private filled(room: Room, data: ArrayBuffer, bytes: number): GPUBindGroup {
    if (bytes > room.size) {
      room.buffer.destroy();
      Object.assign(room, this.roomOf(Math.max(bytes, room.size * 2)));
    }
    this.device.queue.writeBuffer(room.buffer, 0, data, 0, bytes);
    return room.group;
  }

  measured(key: string, metrics: CellMetrics, subpixel: boolean): GlyphTiles {
    if (this.measure?.glyphs.key !== key) {
      const before = this.measure?.glyphs;
      const glyphs = this.drawing.taken(key, metrics, subpixel);
      if (before !== undefined) {
        this.drawing.left(before);
      }
      this.measure = {
        glyphs,
        group: this.device.createBindGroup({
          layout: this.drawing.tileGroups,
          entries: [
            { binding: 0, resource: { buffer: this.view } },
            { binding: 1, resource: glyphs.atlas.texture.createView() },
          ],
        }),
      };
    }
    return this.measure.glyphs.tiles;
  }

  grounded(ground: Rgba): void {
    this.ground = ground;
    this.canvas.style.background = cssOf(ground);
  }

  sized(width: number, height: number): void {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  draw(): void {
    const { device, frame, canvas, measure, ground, drawing } = this;
    if (measure === undefined || canvas.width === 0 || canvas.height === 0) {
      return;
    }
    measure.glyphs.tiles.flush();
    device.queue.writeBuffer(
      this.view,
      0,
      new Float32Array([canvas.width, canvas.height, 0, 0]),
    );
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: {
            r: ground[0] / 255,
            g: ground[1] / 255,
            b: ground[2] / 255,
            a: 1,
          },
        },
      ],
    });
    if (frame.rectCount > 0) {
      pass.setPipeline(drawing.rects);
      pass.setBindGroup(0, this.rectGroup);
      pass.setBindGroup(
        1,
        this.filled(this.rectRoom, frame.rects, frame.rectCount * rectBytes),
      );
      pass.draw(frame.rectCount * cornersOfEach);
    }
    if (frame.tileCount > 0) {
      pass.setBindGroup(0, measure.group);
      pass.setBindGroup(
        1,
        this.filled(this.tileRoom, frame.tiles, frame.tileCount * tileBytes),
      );
      pass.setPipeline(drawing.lighter);
      pass.draw(frame.tileCount * cornersOfEach);
      pass.setPipeline(drawing.darker);
      pass.draw(frame.tileCount * cornersOfEach);
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  dispose(): void {
    this.canvas.remove();
    if (this.measure !== undefined) {
      this.drawing.left(this.measure.glyphs);
      this.measure = undefined;
    }
    this.rectRoom.buffer.destroy();
    this.tileRoom.buffer.destroy();
    this.view.destroy();
    this.context.unconfigure();
  }
}
