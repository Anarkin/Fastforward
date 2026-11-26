import { cssOf, type Rgba } from '../../../components/cells/page/cellColors';

const tickPath = 'M4.5 8.2 7 10.7l4.5-5';

const tickBox = 16;

export function strokeTick(
  context: OffscreenCanvasRenderingContext2D,
  at: { readonly left: number; readonly top: number; readonly size: number },
  color: Rgba,
): void {
  context.save();
  context.translate(at.left, at.top);
  context.scale(at.size / tickBox, at.size / tickBox);
  context.lineWidth = 2;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = cssOf(color);
  context.stroke(new Path2D(tickPath));
  context.restore();
}
