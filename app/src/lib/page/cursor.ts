import {
  cursorLookOf,
  defaultCursorLook,
  type CursorStyle,
  type CursorLook,
} from '../shared/cursorSettings';

export type CursorShape = CursorStyle;

export function pageCursorLook(): CursorLook {
  const view = document.defaultView;
  if (view === null) {
    return defaultCursorLook;
  }
  const style = view.getComputedStyle(document.documentElement);
  return cursorLookOf((name) => style.getPropertyValue(name));
}

export const cursorBlinkInterval = 600;

export function blinkAnimation(again: boolean): string {
  const name = again ? 'cursor-blink-again' : 'cursor-blink';
  return `${name} ${2 * cursorBlinkInterval}ms steps(1) infinite`;
}

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface Edges {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface CursorBox extends Box {
  readonly edges: Edges | undefined;
}

const fromStart = (thickness: number) => Math.ceil(thickness - 0.5);

export function thicknessPixels(thickness: number, ratio: number): number {
  return Math.max(1, fromStart(thickness * ratio));
}

export function cursorBox(
  cell: Box,
  shape: CursorShape,
  thickness: number,
  ratio: number,
): CursorBox {
  switch (shape) {
    case 'block':
      return { ...cell, edges: undefined };
    case 'bar':
      return {
        ...cell,
        width: thicknessPixels(thickness, ratio),
        edges: undefined,
      };
    case 'underline': {
      const height = thicknessPixels(thickness, ratio);
      return {
        ...cell,
        top: cell.top + cell.height - height,
        height,
        edges: undefined,
      };
    }
    case 'outline': {
      const edge = thicknessPixels(thickness, ratio);
      const across = Math.min(edge, Math.floor(cell.height / 2));
      const along = Math.min(edge, Math.floor(cell.width / 2));
      return {
        ...cell,
        edges: { top: across, right: along, bottom: across, left: along },
      };
    }
    default:
      return shape satisfies never;
  }
}

const layoutUnits = 64;

const snapped = (device: number) =>
  Math.round(Math.round(device * layoutUnits) / layoutUnits);

export function pixelBox(box: Box, ratio: number): Box {
  const left = snapped(box.left * ratio);
  const top = snapped(box.top * ratio);
  return {
    left,
    top,
    width: snapped((box.left + box.width) * ratio) - left,
    height: snapped((box.top + box.height) * ratio) - top,
  };
}

export function placedBox(
  box: Box,
  ratio: number,
  origin: { readonly left: number; readonly top: number },
): Box {
  return {
    left: box.left / ratio - origin.left,
    top: box.top / ratio - origin.top,
    width: box.width / ratio,
    height: box.height / ratio,
  };
}

export interface Glyph {
  readonly text: string;
  readonly left: number;
  readonly top: number;
  readonly height: number;
  readonly font: string | undefined;
}

export interface DrawnCursor {
  readonly box: Box;
  readonly edges: Edges | undefined;
  readonly glyph: Glyph | undefined;
}

export function drawnCursor({
  cell,
  text,
  shape,
  thickness,
  ratio,
  origin,
  font,
  glyphBox = cell,
}: {
  readonly cell: Box;
  readonly text: string;
  readonly font?: string;
  readonly glyphBox?: Box;
  readonly shape: CursorShape;
  readonly thickness: number;
  readonly ratio: number;
  readonly origin: { readonly left: number; readonly top: number };
}): DrawnCursor {
  const device = cursorBox(pixelBox(cell, ratio), shape, thickness, ratio);
  const { edges } = device;
  return {
    box: placedBox(device, ratio, origin),
    edges: edges && {
      top: edges.top / ratio,
      right: edges.right / ratio,
      bottom: edges.bottom / ratio,
      left: edges.left / ratio,
    },
    glyph:
      shape === 'block' && text !== ''
        ? {
            text,
            left: glyphBox.left - device.left / ratio,
            top: glyphBox.top - device.top / ratio,
            height: glyphBox.height,
            font,
          }
        : undefined,
  };
}

export function sameDrawing(a: DrawnCursor, b: DrawnCursor): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const px = (value: number) => `${value}px`;

const cursorColor = 'var(--color-cursor)';
const cursorTextColor = 'var(--color-cursor-text)';

export function paintCursor(
  element: HTMLElement,
  drawn: DrawnCursor,
  anchor?: string,
): void {
  const { box, edges, glyph } = drawn;
  Object.assign(element.style, {
    position: 'absolute',
    display: 'block',
    boxSizing: 'border-box',
    margin: '0',
    pointerEvents: 'none',
    positionAnchor: anchor ?? '',
    left:
      anchor === undefined
        ? px(box.left)
        : `calc(anchor(left) + ${px(box.left)})`,
    top:
      anchor === undefined ? px(box.top) : `calc(anchor(top) + ${px(box.top)})`,
    width: px(box.width),
    height: px(box.height),
    background: edges === undefined ? cursorColor : 'none',
    borderStyle: edges === undefined ? 'none' : 'solid',
    borderColor: cursorColor,
    borderWidth:
      edges === undefined
        ? '0'
        : [edges.top, edges.right, edges.bottom, edges.left].map(px).join(' '),
  });
  if (glyph === undefined) {
    element.replaceChildren();
    return;
  }
  const shown = document.createElement('span');
  shown.textContent = glyph.text;
  if (glyph.font !== undefined) {
    shown.style.font = glyph.font;
  }
  Object.assign(shown.style, {
    position: 'absolute',
    left: px(glyph.left),
    top: px(glyph.top),
    lineHeight: px(glyph.height),
    whiteSpace: 'pre',
    color: cursorTextColor,
  });
  element.replaceChildren(shown);
}
