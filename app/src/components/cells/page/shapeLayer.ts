import type { Rgba } from './cellColors';
import { bufferUsage, shaderStage } from './gpuDevice';

export type Shape =
  | {
      readonly kind: 'rect';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly fill: Rgba;
    }
  | {
      readonly kind: 'rounded';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly radius: number;
      readonly fill: Rgba;
    }
  | {
      readonly kind: 'disc';
      readonly x: number;
      readonly y: number;
      readonly radius: number;
      readonly fill: Rgba;
    }
  | {
      readonly kind: 'ring';
      readonly x: number;
      readonly y: number;
      readonly radius: number;
      readonly width: number;
      readonly fill: Rgba;
    }
  | {
      readonly kind: 'curve';
      readonly fromX: number;
      readonly fromY: number;
      readonly toX: number;
      readonly toY: number;
      readonly width: number;
      readonly fill: Rgba;
      readonly dashes?: { readonly dash: number; readonly gap: number };
      readonly hole?: {
        readonly x: number;
        readonly y: number;
        readonly radius: number;
      };
    };

const kinds = { rect: 0, disc: 1, ring: 2, curve: 3, rounded: 4 } as const;

const floatsOfEach = 16;

const bytesOfEach = floatsOfEach * 4;

const shader = `
struct View { size: vec2f, origin: f32, unused: f32 };
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> records: array<f32>;

struct Placed {
  @builtin(position) position: vec4f,
  @location(0) @interpolate(flat) record: u32,
};

fn field(record: u32, at: u32) -> f32 {
  return records[record * ${floatsOfEach}u + at];
}

fn corner(vertex: u32) -> vec2f {
  var corners = array<u32, 6>(0u, 1u, 2u, 2u, 1u, 3u);
  let turned = corners[vertex % 6u];
  return vec2f(f32(turned & 1u), f32(turned >> 1u));
}

fn bounds(record: u32) -> vec4f {
  let kind = u32(field(record, 0u));
  let a = field(record, 4u);
  let b = field(record, 5u);
  let c = field(record, 6u);
  let d = field(record, 7u);
  if (kind == 0u || kind == 4u) {
    return vec4f(a, b, a + c, b + d);
  }
  if (kind == 1u) {
    return vec4f(a - c - 1.0, b - c - 1.0, a + c + 1.0, b + c + 1.0);
  }
  if (kind == 2u) {
    let reach = c + d / 2.0 + 1.0;
    return vec4f(a - reach, b - reach, a + reach, b + reach);
  }
  let half = field(record, 8u) / 2.0 + 1.0;
  return vec4f(min(a, c) - half, min(b, d) - 1.0, max(a, c) + half, max(b, d) + 1.0);
}

@vertex fn placed(@builtin(vertex_index) vertex: u32) -> Placed {
  let record = vertex / 6u;
  let box = bounds(record);
  let at = mix(box.xy, box.zw, corner(vertex));
  var out: Placed;
  out.position = vec4f(
    at.x / view.size.x * 2.0 - 1.0,
    1.0 - at.y / view.size.y * 2.0,
    0.0,
    1.0,
  );
  out.record = record;
  return out;
}

fn toSegment(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let along = b - a;
  let share = clamp(dot(p - a, along) / max(dot(along, along), 1e-6), 0.0, 1.0);
  return length(p - a - along * share);
}

fn onCurve(start: vec2f, end: vec2f, share: f32) -> vec2f {
  let middle = (start.y + end.y) / 2.0;
  let one = vec2f(start.x, middle);
  let two = vec2f(end.x, middle);
  let rest = 1.0 - share;
  return rest * rest * rest * start
    + 3.0 * rest * rest * share * one
    + 3.0 * rest * share * share * two
    + share * share * share * end;
}

fn toCurve(p: vec2f, start: vec2f, end: vec2f) -> f32 {
  var nearest = 1e9;
  var last = start;
  for (var step = 1u; step <= 24u; step++) {
    let next = onCurve(start, end, f32(step) / 24.0);
    nearest = min(nearest, toSegment(p, last, next));
    last = next;
  }
  return nearest;
}

fn covered(record: u32, p: vec2f) -> f32 {
  let kind = u32(field(record, 0u));
  let a = field(record, 4u);
  let b = field(record, 5u);
  let c = field(record, 6u);
  let d = field(record, 7u);
  if (kind == 4u) {
    let radius = field(record, 8u);
    let half = vec2f(c, d) / 2.0;
    let outside = abs(p - vec2f(a, b) - half) - half + vec2f(radius);
    let distance = length(max(outside, vec2f(0.0))) + min(max(outside.x, outside.y), 0.0) - radius;
    return clamp(0.5 - distance, 0.0, 1.0);
  }
  if (kind == 0u) {
    let across = clamp(min(p.x - a, a + c - p.x) + 0.5, 0.0, 1.0);
    let down = clamp(min(p.y - b, b + d - p.y) + 0.5, 0.0, 1.0);
    return across * down;
  }
  if (kind == 1u) {
    return clamp(c - length(p - vec2f(a, b)) + 0.5, 0.0, 1.0);
  }
  if (kind == 2u) {
    return clamp(d / 2.0 - abs(length(p - vec2f(a, b)) - c) + 0.5, 0.0, 1.0);
  }
  var cover = clamp(
    field(record, 8u) / 2.0 - toCurve(p, vec2f(a, b), vec2f(c, d)) + 0.5,
    0.0,
    1.0,
  );
  let holeRadius = field(record, 11u);
  if (holeRadius > 0.0) {
    let hole = vec2f(field(record, 9u), field(record, 10u));
    cover *= clamp(length(p - hole) - holeRadius + 0.5, 0.0, 1.0);
  }
  let period = field(record, 2u);
  if (period > 0.0) {
    let phase = (p.y + view.origin) - floor((p.y + view.origin) / period) * period;
    if (phase >= field(record, 3u)) {
      cover = 0.0;
    }
  }
  return cover;
}

@fragment fn painted(shape: Placed) -> @location(0) vec4f {
  let cover = covered(shape.record, shape.position.xy);
  let fill = vec4f(
    field(shape.record, 12u),
    field(shape.record, 13u),
    field(shape.record, 14u),
    field(shape.record, 15u),
  );
  let alpha = fill.a * cover;
  return vec4f(fill.rgb * alpha, alpha);
}`;

const over: GPUBlendComponent = {
  operation: 'add',
  srcFactor: 'one',
  dstFactor: 'one-minus-src-alpha',
};

class ShapeDrawing {
  readonly format = navigator.gpu.getPreferredCanvasFormat();
  readonly pipeline: GPURenderPipeline;
  readonly groups: GPUBindGroupLayout;

  constructor(device: GPUDevice) {
    this.groups = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: shaderStage.vertex | shaderStage.fragment,
          buffer: {},
        },
        {
          binding: 1,
          visibility: shaderStage.vertex | shaderStage.fragment,
          buffer: { type: 'read-only-storage' },
        },
      ],
    });
    const module = device.createShaderModule({ code: shader });
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.groups] }),
      vertex: { module },
      fragment: {
        module,
        targets: [{ format: this.format, blend: { color: over, alpha: over } }],
      },
    });
  }
}

const drawings = new WeakMap<GPUDevice, ShapeDrawing>();

function drawingOf(device: GPUDevice): ShapeDrawing {
  let drawing = drawings.get(device);
  if (drawing === undefined) {
    drawing = new ShapeDrawing(device);
    drawings.set(device, drawing);
  }
  return drawing;
}

const firstRoom = 1 << 14;

function recordOf(shape: Shape, into: Float32Array, at: number): void {
  const base = at * floatsOfEach;
  into.fill(0, base, base + floatsOfEach);
  into[base] = kinds[shape.kind];
  switch (shape.kind) {
    case 'rect':
      into.set([shape.x, shape.y, shape.width, shape.height], base + 4);
      break;
    case 'rounded':
      into.set([shape.x, shape.y, shape.width, shape.height], base + 4);
      into[base + 8] = shape.radius;
      break;
    case 'disc':
      into.set([shape.x, shape.y, shape.radius, 0], base + 4);
      break;
    case 'ring':
      into.set([shape.x, shape.y, shape.radius, shape.width], base + 4);
      break;
    case 'curve':
      into.set([shape.fromX, shape.fromY, shape.toX, shape.toY], base + 4);
      into[base + 8] = shape.width;
      if (shape.hole !== undefined) {
        into.set([shape.hole.x, shape.hole.y, shape.hole.radius], base + 9);
      }
      if (shape.dashes !== undefined) {
        into[base + 2] = shape.dashes.dash + shape.dashes.gap;
        into[base + 3] = shape.dashes.dash;
      }
      break;
  }
  const [red, green, blue, alpha] = shape.fill;
  into.set([red / 255, green / 255, blue / 255, alpha], base + 12);
}

export class ShapeLayer {
  private readonly drawing: ShapeDrawing;
  private readonly view: GPUBuffer;
  private records: GPUBuffer;
  private room = firstRoom;
  private group: GPUBindGroup;
  private data = new Float32Array(firstRoom / 4);
  private count = 0;

  constructor(private readonly device: GPUDevice) {
    this.drawing = drawingOf(device);
    this.view = device.createBuffer({
      size: 16,
      usage: bufferUsage.uniform | bufferUsage.copyDst,
    });
    this.records = this.recordsOf(firstRoom);
    this.group = this.groupOf();
  }

  private recordsOf(size: number): GPUBuffer {
    return this.device.createBuffer({
      size,
      usage: bufferUsage.storage | bufferUsage.copyDst,
    });
  }

  private groupOf(): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.drawing.groups,
      entries: [
        { binding: 0, resource: { buffer: this.view } },
        { binding: 1, resource: { buffer: this.records } },
      ],
    });
  }

  written(
    shapes: readonly Shape[],
    width: number,
    height: number,
    origin: number,
  ): void {
    const bytes = Math.max(bytesOfEach, shapes.length * bytesOfEach);
    if (bytes > this.room) {
      this.records.destroy();
      this.room = Math.max(bytes, this.room * 2);
      this.records = this.recordsOf(this.room);
      this.group = this.groupOf();
    }
    if (this.data.byteLength < bytes) {
      this.data = new Float32Array(this.room / 4);
    }
    shapes.forEach((shape, at) => recordOf(shape, this.data, at));
    this.device.queue.writeBuffer(
      this.records,
      0,
      this.data,
      0,
      shapes.length * floatsOfEach,
    );
    this.device.queue.writeBuffer(
      this.view,
      0,
      new Float32Array([width, height, origin, 0]),
    );
    this.count = shapes.length;
  }

  encoded(pass: GPURenderPassEncoder): void {
    if (this.count > 0) {
      pass.setPipeline(this.drawing.pipeline);
      pass.setBindGroup(0, this.group);
      pass.draw(this.count * 6);
    }
  }

  dispose(): void {
    this.records.destroy();
    this.view.destroy();
  }
}
