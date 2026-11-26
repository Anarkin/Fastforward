import {
  filled,
  packedOf,
  parsedColor,
  type Rgba,
} from '../../../components/cells/page/cellColors';

export interface Outline {
  readonly color: Rgba;
  readonly width: number;
  readonly offset: number;
}

export function outlineOf(
  style: CSSStyleDeclaration,
  ground: Rgba,
): Outline | undefined {
  const width = parseFloat(style.outlineWidth) || 0;
  return style.outlineStyle === 'none' || width <= 0
    ? undefined
    : {
        color: filled(ground, parsedColor(style.outlineColor)),
        width,
        offset: parseFloat(style.outlineOffset) || 0,
      };
}

export function pushOutline(
  rects: number[],
  outline: Outline | undefined,
  box: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  },
  scale: number,
): void {
  if (outline === undefined) {
    return;
  }
  const thickness = Math.max(1, Math.floor(outline.width * scale));
  const to = Math.max(thickness, Math.round(-outline.offset * scale));
  const from = to - thickness;
  const band = thickness;
  const color = packedOf(outline.color);
  const { left, top, width, height } = box;
  rects.push(left + from, top + from, width - 2 * from, band, color);
  rects.push(left + from, top + height - to, width - 2 * from, band, color);
  rects.push(left + from, top + to, band, height - 2 * to, color);
  rects.push(left + width - to, top + to, band, height - 2 * to, color);
}
