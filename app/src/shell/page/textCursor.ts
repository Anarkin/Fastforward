import { findClusterBreak } from '@codemirror/state';
import { watchDevicePixels } from '../../lib/page/devicePixels';
import {
  blinkAnimation,
  drawnCursor,
  pageCursorLook,
  paintCursor,
  pixelBox,
  placedBox,
  sameDrawing,
  type Box,
  type DrawnCursor,
} from '../../lib/page/cursor';

const textCursorClass = 'text-cursor';

const selectingAttribute = 'data-text-cursor';

const textTypes = new Set(['text', 'search', 'url', 'tel', 'password']);

const anchorName = '--text-cursor-field';

export function isTextField(
  element: Element | null,
): element is HTMLInputElement {
  return (
    element instanceof HTMLInputElement &&
    textTypes.has(element.type) &&
    !element.readOnly &&
    !element.disabled
  );
}

const passwordBullet = '•';

const pixels = (value: string) => parseFloat(value) || 0;

export function shownText(field: { type: string; value: string }): string {
  return field.type === 'password'
    ? passwordBullet.repeat(field.value.length)
    : field.value;
}

export function headOf(field: {
  selectionStart: number | null;
  selectionEnd: number | null;
  selectionDirection: string | null;
}): number {
  return (
    (field.selectionDirection === 'backward'
      ? field.selectionStart
      : field.selectionEnd) ?? 0
  );
}

export interface FieldMetrics {
  readonly content: Box;
  readonly lineHeight: number;
  readonly scrolled: number;
  readonly before: number;
  readonly through: number | undefined;
  readonly emptyCell: number;
}

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

function paintSelection(field: HTMLElement, placed: readonly Box[]): void {
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

export function fieldCell(metrics: FieldMetrics): Box {
  const { content, lineHeight, scrolled, before, through, emptyCell } = metrics;
  return {
    left: content.left + before - scrolled,
    top: content.top + (content.height - lineHeight) / 2,
    width: through === undefined ? emptyCell : through - before,
    height: lineHeight,
  };
}

const measuredStyles = [
  'font',
  'letterSpacing',
  'wordSpacing',
  'fontKerning',
  'fontFeatureSettings',
  'fontVariationSettings',
  'textTransform',
] as const;

interface Measured {
  readonly key: string;
  readonly drawn: DrawnCursor;
}

class TextCursor {
  private readonly element = document.createElement('div');
  private readonly measure = document.createElement('span');
  private readonly textNode = document.createTextNode('');
  private readonly digit = document.createElement('span');
  private readonly range = document.createRange();
  private readonly watched = new ResizeObserver(() => this.schedule());
  private readonly moved = new MutationObserver(() => this.schedule());
  private field: HTMLInputElement | undefined;
  private last: Measured | undefined;
  private font = '';
  private frame: number | undefined;
  private place = '';

  constructor() {
    this.element.className = textCursorClass;
    this.element.setAttribute('aria-hidden', 'true');
    Object.assign(this.element.style, { position: 'absolute', margin: '0' });
    Object.assign(this.measure.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      visibility: 'hidden',
      whiteSpace: 'pre',
      pointerEvents: 'none',
    });
    this.digit.textContent = '0';
    this.measure.append(this.textNode, this.digit);
  }

  follow(field: HTMLInputElement): void {
    if (this.field !== field) {
      this.leave();
      this.field = field;
      field.style.setProperty('anchor-name', anchorName);
      field.setAttribute(selectingAttribute, '');
      this.watched.observe(field);
      if (field.parentElement !== null) {
        this.moved.observe(field.parentElement, { childList: true });
      }
    }
    this.schedule();
  }

  leave(): void {
    this.field?.style.removeProperty('anchor-name');
    this.field?.removeAttribute(selectingAttribute);
    if (this.field !== undefined) {
      paintSelection(this.field, []);
    }
    this.field = undefined;
    this.last = undefined;
    this.font = '';
    this.place = '';
    this.watched.disconnect();
    this.moved.disconnect();
    this.element.remove();
    this.measure.remove();
  }

  schedule(): void {
    if (this.frame === undefined) {
      this.frame = requestAnimationFrame(() => {
        this.frame = undefined;
        this.draw();
      });
    }
  }

  private draw(): void {
    const { field } = this;
    if (field !== undefined && !field.isConnected) {
      this.leave();
      return;
    }
    if (field === undefined || document.activeElement !== field) {
      this.element.remove();
      if (field !== undefined) {
        paintSelection(field, []);
      }
      this.last = undefined;
      this.place = '';
      return;
    }
    if (this.element.previousSibling !== field) {
      field.after(this.element);
    }
    const look = pageCursorLook();
    const text = shownText(field);
    const head = headOf(field);
    const style = getComputedStyle(field);
    const rect = field.getBoundingClientRect();
    const key = JSON.stringify([
      text,
      head,
      field.selectionStart,
      field.selectionEnd,
      look,
      devicePixelRatio,
      field.scrollLeft,
      style.font,
      rect.left,
      rect.top,
      rect.width,
      rect.height,
    ]);
    if (this.last?.key !== key) {
      const { drawn, selection } = this.drawing(
        field,
        style,
        rect,
        text,
        head,
        look,
      );
      if (this.last === undefined || !sameDrawing(this.last.drawn, drawn)) {
        paintCursor(this.element, drawn, anchorName);
      }
      paintSelection(field, selection);
      this.last = { key, drawn };
    }
    const place = JSON.stringify([field.value, head]);
    if (place !== this.place) {
      this.element.style.animation = look.blink
        ? blinkAnimation(this.element.style.animationName === 'cursor-blink')
        : 'none';
      this.place = place;
    }
  }

  private drawing(
    field: HTMLInputElement,
    style: CSSStyleDeclaration,
    rect: DOMRect,
    text: string,
    head: number,
    look: ReturnType<typeof pageCursorLook>,
  ): { readonly drawn: DrawnCursor; readonly selection: readonly Box[] } {
    const end = head < text.length ? findClusterBreak(text, head) : head;
    this.prepare(style, text);
    const origin = this.measure.getBoundingClientRect().left;
    const at = (from: number, to: number) => {
      this.range.setStart(this.textNode, from);
      this.range.setEnd(this.textNode, to);
      return this.range.getBoundingClientRect();
    };
    const offsetOf = (index: number) =>
      index === 0 ? 0 : at(0, index).right - origin;
    const under = end > head ? at(head, end) : undefined;
    const before = under === undefined ? offsetOf(head) : under.left - origin;
    const padding = {
      left: rect.left + pixels(style.borderLeftWidth),
      top: rect.top + pixels(style.borderTopWidth),
    };
    const left = padding.left + pixels(style.paddingLeft);
    const top = padding.top + pixels(style.paddingTop);
    const line = {
      content: {
        left,
        top,
        width:
          rect.right -
          pixels(style.borderRightWidth) -
          pixels(style.paddingRight) -
          left,
        height:
          rect.bottom -
          pixels(style.borderBottomWidth) -
          pixels(style.paddingBottom) -
          top,
      },
      lineHeight: this.lineHeightOf(style),
      scrolled: field.scrollLeft,
    };
    const ratio = devicePixelRatio;
    const from = Math.min(field.selectionStart ?? 0, field.selectionEnd ?? 0);
    const to = Math.max(field.selectionStart ?? 0, field.selectionEnd ?? 0);
    this.range.setStart(this.textNode, from);
    this.range.setEnd(this.textNode, to);
    const pieces = to > from ? [...this.range.getClientRects()] : [];
    const selected = pieces.flatMap((piece) => {
      const box = fieldSelection(
        line,
        piece.left - origin,
        piece.right - origin,
      );
      return box === undefined ? [] : [box];
    });
    return {
      drawn: drawnCursor({
        cell: fieldCell({
          ...line,
          before,
          through: under === undefined ? undefined : under.right - origin,
          emptyCell: this.digit.getBoundingClientRect().width,
        }),
        text: text.slice(head, end),
        shape: look.style,
        thickness: look.width,
        ratio,
        origin: { left: rect.left, top: rect.top },
        font: style.font,
      }),
      selection: selected.map((box) =>
        placedBox(pixelBox(box, ratio), ratio, padding),
      ),
    };
  }

  private prepare(style: CSSStyleDeclaration, text: string): void {
    if (!this.measure.isConnected) {
      document.body.append(this.measure);
    }
    const font = JSON.stringify(measuredStyles.map((name) => style[name]));
    if (font !== this.font) {
      for (const name of measuredStyles) {
        this.measure.style[name] = style[name];
      }
      this.measure.style.direction = style.direction;
      this.font = font;
    }
    if (this.textNode.data !== text) {
      this.textNode.data = text;
    }
  }

  private lineHeightOf(style: CSSStyleDeclaration): number {
    const lineHeight = parseFloat(style.lineHeight);
    return Number.isFinite(lineHeight)
      ? lineHeight
      : this.measure.getBoundingClientRect().height;
  }
}

export function installTextCursors(): () => void {
  const cursor = new TextCursor();
  const followFocus = () => {
    const focused = document.activeElement;
    if (isTextField(focused)) {
      cursor.follow(focused);
    } else {
      cursor.leave();
    }
  };
  const schedule = () => cursor.schedule();
  const stopWatching = watchDevicePixels(schedule);
  const listened: [EventTarget, string, () => void][] = [
    [document, 'focusin', followFocus],
    [document, 'focusout', () => requestAnimationFrame(followFocus)],
    [document, 'selectionchange', schedule],
    [document, 'input', schedule],
    [document, 'scroll', schedule],
    [window, 'resize', schedule],
    [window, 'focus', schedule],
    [window, 'blur', schedule],
  ];
  for (const [target, type, listener] of listened) {
    target.addEventListener(type, listener, true);
  }
  followFocus();
  return () => {
    for (const [target, type, listener] of listened) {
      target.removeEventListener(type, listener, true);
    }
    stopWatching();
    cursor.leave();
  };
}
