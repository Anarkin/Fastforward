export const overlayScrollbarClass = 'overlay-scrollbar';

export interface Thumb {
  readonly offset: number;
  readonly length: number;
}

const minThumb = 24;
const hideAfter = 1000;

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

type Axis = 'vertical' | 'horizontal';

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
      return element;
    }
    element = element.parentElement;
  }
  return null;
}

class Bar {
  readonly element = document.createElement('div');
  scroller: Element | null = null;
  private timer: number | undefined;
  private drag: { pointer: number; scroll: number; ratio: number } | undefined;

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
    const { scroller, axis } = this;
    if (!scroller?.isConnected) {
      return false;
    }
    const vertical = axis === 'vertical';
    const thumb = vertical
      ? thumbOf(
          scroller.scrollHeight,
          scroller.clientHeight,
          scroller.scrollTop,
        )
      : thumbOf(
          scroller.scrollWidth,
          scroller.clientWidth,
          scroller.scrollLeft,
        );
    if (!thumb) {
      return false;
    }
    const box = scroller.getBoundingClientRect();
    const size = parseFloat(
      getComputedStyle(document.body).getPropertyValue('--scrollbar-size'),
    );
    const { style } = this.element;
    if (vertical) {
      style.left = `${box.left + scroller.clientLeft + scroller.clientWidth - size}px`;
      style.top = `${box.top + scroller.clientTop + thumb.offset}px`;
      style.width = `${size}px`;
      style.height = `${thumb.length}px`;
    } else {
      style.left = `${box.left + scroller.clientLeft + thumb.offset}px`;
      style.top = `${box.top + scroller.clientTop + scroller.clientHeight - size}px`;
      style.width = `${thumb.length}px`;
      style.height = `${size}px`;
    }
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
    const vertical = this.axis === 'vertical';
    this.drag = {
      pointer: vertical ? event.clientY : event.clientX,
      scroll: vertical ? scroller.scrollTop : scroller.scrollLeft,
      ratio: vertical
        ? scrollPerPixel(scroller.scrollHeight, scroller.clientHeight)
        : scrollPerPixel(scroller.scrollWidth, scroller.clientWidth),
    };
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    const { drag, scroller } = this;
    if (!drag || !scroller) {
      return;
    }
    const vertical = this.axis === 'vertical';
    const moved = (vertical ? event.clientY : event.clientX) - drag.pointer;
    const scroll = drag.scroll + moved * drag.ratio;
    if (vertical) {
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
