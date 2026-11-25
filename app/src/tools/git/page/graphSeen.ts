import type { Shape } from '../../../components/cells/page/shapeLayer';
import type { Rgba } from './commitListLooks';
import { dashesOf, type GraphShapes } from './graphShapes';

export interface SeenShape {
  readonly kind: Shape['kind'];
  readonly color: number;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
  readonly radius?: number;
  readonly dashed?: boolean;
}

export function shapesOf(
  shapes: GraphShapes,
  fills: readonly Rgba[],
  scale: number,
): Shape[] {
  const fill = (index: number) => fills[index % fills.length] ?? [0, 0, 0, 1];
  const dashes = dashesOf(scale);
  return [
    ...shapes.rects.map((rect): Shape => ({
      kind: 'rect',
      ...rect,
      fill: fill(rect.color),
    })),
    ...shapes.curves.map((curve): Shape => ({
      kind: 'curve',
      fromX: curve.fromX,
      fromY: curve.fromY,
      toX: curve.toX,
      toY: curve.toY,
      width: curve.width,
      fill: fill(curve.color),
      ...(curve.dashed && { dashes }),
      ...(curve.hole !== undefined && { hole: curve.hole }),
    })),
    ...shapes.rings.map((ring): Shape => ({
      kind: 'ring',
      ...ring,
      fill: fill(ring.color),
    })),
    ...shapes.discs.map((disc): Shape => ({
      kind: 'disc',
      ...disc,
      fill: fill(disc.color),
    })),
  ];
}

export function seenShapesOf(
  shapes: GraphShapes,
  origin: number,
  scale: number,
): SeenShape[] {
  const css = (pixels: number) => pixels / scale;
  return [
    ...shapes.rects.map((rect) => ({
      kind: 'rect' as const,
      color: rect.color,
      x: css(rect.x),
      y: origin + css(rect.y),
      width: css(rect.width),
      height: css(rect.height),
    })),
    ...shapes.curves.map((curve) => ({
      kind: 'curve' as const,
      color: curve.color,
      x: css(curve.fromX),
      y: origin + css(curve.fromY),
      width: css(curve.toX - curve.fromX),
      height: css(curve.toY - curve.fromY),
      dashed: curve.dashed,
    })),
    ...shapes.rings.map((ring) => ({
      kind: 'ring' as const,
      color: ring.color,
      x: css(ring.x),
      y: origin + css(ring.y),
      radius: css(ring.radius),
    })),
    ...shapes.discs.map((disc) => ({
      kind: 'disc' as const,
      color: disc.color,
      x: css(disc.x),
      y: origin + css(disc.y),
      radius: css(disc.radius),
    })),
  ];
}
