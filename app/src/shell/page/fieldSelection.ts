import type { Box } from '../../lib/page/pixelBoxes';
import type { FieldMetrics } from './textCursor';

export function fieldSelection(
  {
    content,
    lineHeight,
    scrolled,
  }: Pick<FieldMetrics, 'content' | 'lineHeight' | 'scrolled'>,
  from: number,
  to: number,
): Box | undefined {
  const left = Math.max(content.left, content.left + from - scrolled);
  const right = Math.min(
    content.left + content.width,
    content.left + to - scrolled,
  );
  return right > left
    ? {
        left,
        top: content.top + (content.height - lineHeight) / 2,
        width: right - left,
        height: lineHeight,
      }
    : undefined;
}

const selectionLayer =
  'linear-gradient(var(--selection-background), var(--selection-background))';

const selectionStyles = [
  'backgroundImage',
  'backgroundRepeat',
  'backgroundPosition',
  'backgroundSize',
] as const;

export function paintSelection(
  field: HTMLElement,
  placed: readonly Box[],
): void {
  if (placed.length === 0) {
    for (const name of selectionStyles) {
      field.style[name] = '';
    }
    return;
  }
  const layers = (layer: (box: Box) => string) => placed.map(layer).join(', ');
  Object.assign(field.style, {
    backgroundImage: layers(() => selectionLayer),
    backgroundRepeat: layers(() => 'no-repeat'),
    backgroundPosition: layers((box) => `${box.left}px ${box.top}px`),
    backgroundSize: layers((box) => `${box.width}px ${box.height}px`),
  });
}
