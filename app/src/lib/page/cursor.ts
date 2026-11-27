import {
  cursorLookOf,
  defaultCursorLook,
  type CursorStyle,
  type CursorLook,
} from '../shared/cursorSettings';
import { pixelBox, placedBox, type Box, type Edges } from './pixelBoxes';

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

function blinkAnimation(again: boolean): string {
  const name = again ? 'cursor-blink-again' : 'cursor-blink';
  return `${name} ${2 * cursorBlinkInterval}ms steps(1) infinite`;
}

interface Blinking {
  readonly style: { animation: string; readonly animationName: string };
}

export function blinkAnew(element: Blinking, blink: boolean): void {
  element.style.animation = blink
    ? blinkAnimation(element.style.animationName === 'cursor-blink')
    : 'none';
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

export interface TextBoxCopy {
  readonly value: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly scrolled: number;
  readonly lineHeight: string;
  readonly styles: Readonly<Record<string, string>>;
}

export interface Glyph {
  readonly text: string;
  readonly left: number;
  readonly top: number;
  readonly height: number;
  readonly font: string | undefined;
  readonly boxCopy?: TextBoxCopy;
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
  element.style.overflow = glyph?.boxCopy === undefined ? '' : 'hidden';
  if (glyph?.boxCopy === undefined) {
    shades.get(element)?.replaceChildren();
  }
  if (glyph === undefined) {
    element.replaceChildren();
    return;
  }
  if (glyph.boxCopy !== undefined) {
    paintBoxCopy(element, glyph, glyph.boxCopy);
    return;
  }
  const shown = element.ownerDocument.createElement('span');
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

const shades = new WeakMap<HTMLElement, ShadowRoot>();

function paintBoxCopy(
  element: HTMLElement,
  glyph: Glyph,
  {
    value,
    left,
    top,
    width,
    height,
    scrolled,
    lineHeight,
    styles,
  }: TextBoxCopy,
): void {
  const copy = element.ownerDocument.createElement('input');
  copy.readOnly = true;
  copy.tabIndex = -1;
  copy.value = value;
  if (glyph.font !== undefined) {
    copy.style.font = glyph.font;
  }
  Object.assign(copy.style, styles, {
    position: 'absolute',
    left: px(left),
    top: px(top),
    width: px(width),
    height: px(height),
    lineHeight,
    padding: '0',
    margin: '0',
    border: '0',
    outline: 'none',
    background: 'transparent',
    color: cursorTextColor,
    caretColor: 'transparent',
    pointerEvents: 'none',
  });
  element.replaceChildren();
  const shade = shades.get(element) ?? element.attachShadow({ mode: 'closed' });
  shades.set(element, shade);
  shade.replaceChildren(copy);
  copy.scrollLeft = scrolled;
}

export class CursorMark {
  private drawn: DrawnCursor | undefined;
  private place: string | undefined;

  constructor(readonly element: HTMLElement) {}

  paint(drawn: DrawnCursor, anchor?: string): void {
    if (this.drawn === undefined || !sameDrawing(this.drawn, drawn)) {
      paintCursor(this.element, drawn, anchor);
      this.drawn = drawn;
    }
  }

  blinkAt(place: string, blink: boolean): void {
    if (place !== this.place) {
      blinkAnew(this.element, blink);
      this.place = place;
    }
  }

  hide(): void {
    this.element.remove();
    this.drawn = undefined;
    this.place = undefined;
  }
}
