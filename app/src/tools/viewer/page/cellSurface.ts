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

const corner = `vec2f(f32(vertex & 1u), f32(vertex >> 1u))`;

const rectShader = `
struct View { size: vec2f };
@group(0) @binding(0) var<uniform> view: View;

struct Placed {
  @builtin(position) position: vec4f,
  @location(0) fill: vec4f,
};

@vertex fn placedRect(
  @builtin(vertex_index) vertex: u32,
  @location(0) box: vec4<i32>,
  @location(1) fill: vec4f,
) -> Placed {
  let at = vec2f(box.xy) + ${corner} * vec2f(box.zw);
  ${placed}
  out.fill = fill;
  return out;
}

@fragment fn filled(rect: Placed) -> @location(0) vec4f {
  return vec4f(rect.fill.rgb, 1.0);
}`;

const tileShader = `
struct View { size: vec2f };
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var tiles: texture_2d<f32>;

override lighter: f32 = 1.0;

struct Placed {
  @builtin(position) position: vec4f,
  @location(0) texel: vec2f,
  @location(1) @interpolate(flat) under: vec3f,
};

@vertex fn placedTile(
  @builtin(vertex_index) vertex: u32,
  @location(0) place: vec2<i32>,
  @location(1) tile: vec4<i32>,
  @location(2) ground: vec4f,
) -> Placed {
  let reach = ${corner} * vec2f(tile.zw);
  let at = vec2f(place) + reach;
  ${placed}
  out.texel = vec2f(tile.xy) + reach;
  out.under = ground.rgb;
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

const rectLayout: GPUVertexBufferLayout = {
  arrayStride: rectBytes,
  stepMode: 'instance',
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'sint16x4' },
    { shaderLocation: 1, offset: 8, format: 'unorm8x4' },
  ],
};

const tileLayout: GPUVertexBufferLayout = {
  arrayStride: tileBytes,
  stepMode: 'instance',
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'sint16x2' },
    { shaderLocation: 1, offset: 4, format: 'sint16x4' },
    { shaderLocation: 2, offset: 12, format: 'unorm8x4' },
  ],
};

const strip: GPUPrimitiveState = { topology: 'triangle-strip' };

interface Measured {
  readonly key: string;
  readonly atlas: GlyphAtlas;
  readonly tiles: GlyphTiles;
  readonly group: GPUBindGroup;
}

interface Room {
  buffer: GPUBuffer;
  size: number;
}

export class CellSurface {
  readonly canvas: HTMLCanvasElement;
  readonly frame = new CellFrame();
  private readonly context: GPUCanvasContext;
  private readonly view: GPUBuffer;
  private readonly rects: GPURenderPipeline;
  private readonly lighter: GPURenderPipeline;
  private readonly darker: GPURenderPipeline;
  private readonly rectGroup: GPUBindGroup;
  private readonly tileGroups: GPUBindGroupLayout;
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
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque' });
    this.view = device.createBuffer({
      size: 16,
      usage: bufferUsage.uniform | bufferUsage.copyDst,
    });
    const sized: GPUBindGroupLayoutEntry = {
      binding: 0,
      visibility: shaderStage.vertex,
      buffer: {},
    };
    const rectGroups = device.createBindGroupLayout({ entries: [sized] });
    this.tileGroups = device.createBindGroupLayout({
      entries: [
        sized,
        { binding: 1, visibility: shaderStage.fragment, texture: {} },
      ],
    });
    const rectModule = device.createShaderModule({ code: rectShader });
    const tileModule = device.createShaderModule({ code: tileShader });
    this.rects = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [rectGroups] }),
      vertex: { module: rectModule, buffers: [rectLayout] },
      fragment: { module: rectModule, targets: [{ format }] },
      primitive: strip,
    });
    const tiled = device.createPipelineLayout({
      bindGroupLayouts: [this.tileGroups],
    });
    const blended = (
      color: GPUBlendComponent,
      lighter: number,
    ): GPURenderPipeline =>
      device.createRenderPipeline({
        layout: tiled,
        vertex: { module: tileModule, buffers: [tileLayout] },
        fragment: {
          module: tileModule,
          constants: { lighter },
          targets: [{ format, blend: { color, alpha: kept } }],
        },
        primitive: strip,
      });
    this.lighter = blended(addedTo, 1);
    this.darker = blended(takenFrom, -1);
    this.rectGroup = device.createBindGroup({
      layout: rectGroups,
      entries: [{ binding: 0, resource: { buffer: this.view } }],
    });
    this.rectRoom = this.roomOf(firstRoom);
    this.tileRoom = this.roomOf(firstRoom);
  }

  private roomOf(size: number): Room {
    return {
      size,
      buffer: this.device.createBuffer({
        size,
        usage: bufferUsage.vertex | bufferUsage.copyDst,
      }),
    };
  }

  private filled(room: Room, data: ArrayBuffer, bytes: number): GPUBuffer {
    if (bytes > room.size) {
      room.buffer.destroy();
      Object.assign(room, this.roomOf(Math.max(bytes, room.size * 2)));
    }
    this.device.queue.writeBuffer(room.buffer, 0, data, 0, bytes);
    return room.buffer;
  }

  measured(key: string, metrics: CellMetrics, subpixel: boolean): GlyphTiles {
    if (this.measure?.key !== key) {
      this.measure?.atlas.dispose();
      const atlas = new GlyphAtlas(this.device, metrics, subpixel);
      this.measure = {
        key,
        atlas,
        tiles: new GlyphTiles(metrics, atlas.size, atlas),
        group: this.device.createBindGroup({
          layout: this.tileGroups,
          entries: [
            { binding: 0, resource: { buffer: this.view } },
            { binding: 1, resource: atlas.texture.createView() },
          ],
        }),
      };
    }
    return this.measure.tiles;
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
    const { device, frame, canvas, measure, ground } = this;
    if (measure === undefined || canvas.width === 0 || canvas.height === 0) {
      return;
    }
    measure.tiles.flush();
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
      pass.setPipeline(this.rects);
      pass.setBindGroup(0, this.rectGroup);
      pass.setVertexBuffer(
        0,
        this.filled(this.rectRoom, frame.rects, frame.rectCount * rectBytes),
      );
      pass.draw(4, frame.rectCount);
    }
    if (frame.tileCount > 0) {
      pass.setBindGroup(0, measure.group);
      pass.setVertexBuffer(
        0,
        this.filled(this.tileRoom, frame.tiles, frame.tileCount * tileBytes),
      );
      pass.setPipeline(this.lighter);
      pass.draw(4, frame.tileCount);
      pass.setPipeline(this.darker);
      pass.draw(4, frame.tileCount);
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  dispose(): void {
    this.canvas.remove();
    this.measure?.atlas.dispose();
    this.rectRoom.buffer.destroy();
    this.tileRoom.buffer.destroy();
    this.view.destroy();
    this.context.unconfigure();
  }
}
