import { findClusterBreak } from '@codemirror/state';
import { watchDevicePixels } from './devicePixels';
import {
  blinkAnimation,
  drawnCursor,
  pageCursorLook,
  paintCursor,
  sameDrawing,
  type Box,
  type DrawnCursor,
} from './cursor';

const textCursorClass = 'text-cursor';

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
      this.watched.observe(field);
      if (field.parentElement !== null) {
        this.moved.observe(field.parentElement, { childList: true });
      }
    }
    this.schedule();
  }

  leave(): void {
    this.field?.style.removeProperty('anchor-name');
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
    if (
      field === undefined ||
      document.activeElement !== field ||
      !document.hasFocus()
    ) {
      this.element.remove();
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
      const drawn = this.drawing(field, style, rect, text, head, look);
      if (this.last === undefined || !sameDrawing(this.last.drawn, drawn)) {
        paintCursor(this.element, drawn, anchorName);
      }
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
  ): DrawnCursor {
    const end = head < text.length ? findClusterBreak(text, head) : head;
    this.prepare(style, text);
    const origin = this.measure.getBoundingClientRect().left;
    const at = (from: number, to: number) => {
      this.range.setStart(this.textNode, from);
      this.range.setEnd(this.textNode, to);
      return this.range.getBoundingClientRect();
    };
    const under = end > head ? at(head, end) : undefined;
    const before =
      under === undefined
        ? head === 0
          ? 0
          : at(0, head).right - origin
        : under.left - origin;
    const left =
      rect.left + pixels(style.borderLeftWidth) + pixels(style.paddingLeft);
    const top =
      rect.top + pixels(style.borderTopWidth) + pixels(style.paddingTop);
    return drawnCursor({
      cell: fieldCell({
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
        before,
        through: under === undefined ? undefined : under.right - origin,
        emptyCell: this.digit.getBoundingClientRect().width,
      }),
      text: text.slice(head, end),
      shape: look.style,
      barWidth: look.barWidth,
      ratio: devicePixelRatio,
      origin: { left: rect.left, top: rect.top },
      font: style.font,
    });
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
