export const overlayScrollbarClass = 'overlay-scrollbar';
export const ownScrollbarAttribute = 'data-own-vertical-scrollbar';

export function drawsOverlay(axis: Axis, ownsVertical: boolean): boolean {
  return axis === 'horizontal' || !ownsVertical;
}

export interface Thumb {
  readonly offset: number;
  readonly length: number;
}

const minThumb = 24;
export const hideAfter = 1000;

export function thumbOf(
  scrollSize: number,
  clientSize: number,
  scrolled: number,
): Thumb | undefined {
  if (scrollSize <= clientSize + 1) {
    return undefined;
  }
  const length = Math.min(
    clientSize,
    Math.max(minThumb, (clientSize * clientSize) / scrollSize),
  );
  const range = scrollSize - clientSize;
  const offset =
    ((clientSize - length) * Math.min(Math.max(scrolled, 0), range)) / range;
  return { offset, length };
}

export function scrollPerPixel(scrollSize: number, clientSize: number): number {
  const thumb = thumbOf(scrollSize, clientSize, 0);
  return thumb ? (scrollSize - clientSize) / (clientSize - thumb.length) : 0;
}

export function followedScroller<T>(
  dragging: boolean,
  current: T | null,
  hovered: T | null,
): T | null {
  return dragging ? current : hovered;
}

export type Axis = 'vertical' | 'horizontal';

function scrollsAlong(element: Element, axis: Axis): boolean {
  const style = getComputedStyle(element);
  const overflow = axis === 'vertical' ? style.overflowY : style.overflowX;
  if (overflow !== 'auto' && overflow !== 'scroll') {
    return false;
  }
  return axis === 'vertical'
    ? element.scrollHeight > element.clientHeight + 1
    : element.scrollWidth > element.clientWidth + 1;
}

function scrollerOf(target: EventTarget | null, axis: Axis): Element | null {
  let element = target instanceof Element ? target : null;
  while (element && element !== document.documentElement) {
    if (scrollsAlong(element, axis)) {
      return drawsOverlay(axis, element.hasAttribute(ownScrollbarAttribute))
        ? element
        : null;
    }
    element = element.parentElement;
  }
  return null;
}

export interface ScrollerMetrics {
  readonly left: number;
  readonly top: number;
  readonly clientLeft: number;
  readonly clientTop: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
  readonly scrollWidth: number;
  readonly scrollHeight: number;
  readonly scrollLeft: number;
  readonly scrollTop: number;
}

export interface ThumbBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function thumbBox(
  axis: Axis,
  scroller: ScrollerMetrics,
  size: number,
): ThumbBox | undefined {
  const left = scroller.left + scroller.clientLeft;
  const top = scroller.top + scroller.clientTop;
  if (axis === 'vertical') {
    const thumb = thumbOf(
      scroller.scrollHeight,
      scroller.clientHeight,
      scroller.scrollTop,
    );
    return (
      thumb && {
        left: left + scroller.clientWidth - size,
        top: top + thumb.offset,
        width: size,
        height: thumb.length,
      }
    );
  }
  const thumb = thumbOf(
    scroller.scrollWidth,
    scroller.clientWidth,
    scroller.scrollLeft,
  );
  return (
    thumb && {
      left: left + thumb.offset,
      top: top + scroller.clientHeight - size,
      width: thumb.length,
      height: size,
    }
  );
}

export interface Drag {
  readonly pointer: number;
  readonly scroll: number;
  readonly ratio: number;
}

export function dragFrom(
  axis: Axis,
  scroller: ScrollerMetrics,
  pointer: { readonly clientX: number; readonly clientY: number },
): Drag {
  return axis === 'vertical'
    ? {
        pointer: pointer.clientY,
        scroll: scroller.scrollTop,
        ratio: scrollPerPixel(scroller.scrollHeight, scroller.clientHeight),
      }
    : {
        pointer: pointer.clientX,
        scroll: scroller.scrollLeft,
        ratio: scrollPerPixel(scroller.scrollWidth, scroller.clientWidth),
      };
}

export function draggedScroll(
  axis: Axis,
  drag: Drag,
  pointer: { readonly clientX: number; readonly clientY: number },
): number {
  const now = axis === 'vertical' ? pointer.clientY : pointer.clientX;
  return drag.scroll + (now - drag.pointer) * drag.ratio;
}

function metricsOf(scroller: Element): ScrollerMetrics {
  const { left, top } = scroller.getBoundingClientRect();
  return {
    left,
    top,
    clientLeft: scroller.clientLeft,
    clientTop: scroller.clientTop,
    clientWidth: scroller.clientWidth,
    clientHeight: scroller.clientHeight,
    scrollWidth: scroller.scrollWidth,
    scrollHeight: scroller.scrollHeight,
    scrollLeft: scroller.scrollLeft,
    scrollTop: scroller.scrollTop,
  };
}

class Bar {
  readonly element = document.createElement('div');
  scroller: Element | null = null;
  private timer: number | undefined;
  private drag: Drag | undefined;

  constructor(private readonly axis: Axis) {
    this.element.className = `${overlayScrollbarClass} ${axis}`;
    this.element.addEventListener('pointerdown', this.onPointerDown);
    this.element.addEventListener('pointermove', this.onPointerMove);
    this.element.addEventListener('pointerup', this.onPointerUp);
    this.element.addEventListener('pointercancel', this.onPointerUp);
    this.element.addEventListener('pointerenter', () =>
      window.clearTimeout(this.timer),
    );
    this.element.addEventListener('pointerleave', () => this.hideLater());
    document.body.append(this.element);
  }

  show(scroller: Element | null): void {
    this.scroller = followedScroller(
      this.drag !== undefined,
      this.scroller,
      scroller,
    );
    if (!this.place()) {
      this.hide();
      return;
    }
    this.element.classList.add('shown');
    this.hideLater();
  }

  place(): boolean {
    const { scroller } = this;
    if (!scroller?.isConnected) {
      return false;
    }
    const size = parseFloat(
      getComputedStyle(document.body).getPropertyValue('--scrollbar-size'),
    );
    const box = thumbBox(this.axis, metricsOf(scroller), size);
    if (!box) {
      return false;
    }
    const { style } = this.element;
    style.left = `${box.left}px`;
    style.top = `${box.top}px`;
    style.width = `${box.width}px`;
    style.height = `${box.height}px`;
    return true;
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.element.classList.remove('shown');
  }

  private hideLater(): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      if (!this.drag && !this.element.matches(':hover')) {
        this.hide();
      }
    }, hideAfter);
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    const { scroller } = this;
    if (!scroller || event.button !== 0) {
      return;
    }
    event.preventDefault();
    this.element.setPointerCapture(event.pointerId);
    this.element.classList.add('dragging');
    this.drag = dragFrom(this.axis, metricsOf(scroller), event);
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    const { drag, scroller } = this;
    if (!drag || !scroller) {
      return;
    }
    const scroll = draggedScroll(this.axis, drag, event);
    if (this.axis === 'vertical') {
      scroller.scrollTop = scroll;
    } else {
      scroller.scrollLeft = scroll;
    }
  };

  private readonly onPointerUp = () => {
    this.drag = undefined;
    this.element.classList.remove('dragging');
    this.hideLater();
  };
}

export function installOverlayScrollbars(): void {
  const bars = [new Bar('vertical'), new Bar('horizontal')] as const;
  const showFor = (target: EventTarget | null) => {
    if (bars.some((bar) => bar.element === target)) {
      return;
    }
    bars[0].show(scrollerOf(target, 'vertical'));
    bars[1].show(scrollerOf(target, 'horizontal'));
  };
  document.addEventListener('pointermove', (event) => showFor(event.target), {
    passive: true,
  });
  document.addEventListener(
    'scroll',
    (event) => {
      for (const bar of bars) {
        if (bar.scroller === event.target) {
          bar.show(bar.scroller);
        }
      }
      if (!bars.some((bar) => bar.scroller === event.target)) {
        showFor(event.target);
      }
    },
    { capture: true, passive: true },
  );
  window.addEventListener('resize', () => bars.forEach((bar) => bar.hide()));
}
