import {
  cursorLookOf,
  defaultCursorLook,
  type CursorStyle,
  type CursorLook,
} from '../shell/shared/cursorSettings';

export type CursorShape = CursorStyle | 'outline';

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

export function barPixels(barWidth: number, ratio: number): number {
  return Math.max(1, fromStart(barWidth * ratio));
}
const fromEnd = (thickness: number) => Math.floor(thickness + 0.5);

export function cursorBox(
  cell: Box,
  shape: CursorShape,
  barWidth: number,
  ratio: number,
): CursorBox {
  switch (shape) {
    case 'block':
      return { ...cell, edges: undefined };
    case 'bar':
      return { ...cell, width: barPixels(barWidth, ratio), edges: undefined };
    case 'underline': {
      const height = fromStart(ratio);
      return {
        ...cell,
        top: cell.top + cell.height - height,
        height,
        edges: undefined,
      };
    }
    case 'outline':
      return {
        ...cell,
        edges: {
          top: fromEnd(ratio),
          right: fromEnd(ratio),
          bottom: fromStart(ratio),
          left: fromStart(ratio),
        },
      };
    default:
      return shape satisfies never;
  }
}

export function pixelBox(box: Box, ratio: number): Box {
  const left = Math.round(box.left * ratio);
  const top = Math.round(box.top * ratio);
  return {
    left,
    top,
    width: Math.round((box.left + box.width) * ratio) - left,
    height: Math.round((box.top + box.height) * ratio) - top,
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
  barWidth,
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
  readonly barWidth: number;
  readonly ratio: number;
  readonly origin: { readonly left: number; readonly top: number };
}): DrawnCursor {
  const device = cursorBox(pixelBox(cell, ratio), shape, barWidth, ratio);
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
