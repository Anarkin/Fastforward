import { clicked } from '../shared/keymap';
import { keymap } from './keymap';
import {
  rowScrollerOf,
  scrollbarDrags,
  sidewaysScrollEvent,
  sidewaysScrollerOf,
  type ScrollbarDrag,
} from './scrollbarLinks';
import { followDrag } from './followDrag';
import { afterPaint, inNextFrame } from './afterPaint';
import { elementMetrics } from './scrollerMetrics';
import { frameOf, framedMetrics } from './scrollbarFrames';

import {
  hideAfter,
  Axis,
  ScrollerMetrics,
  clipPathOf,
  thumbBox,
  trackBox,
  contains,
  jumpedScroll,
  dragFrom,
  draggedScroll,
} from './scrollbarGeometry';
export const overlayScrollbarClass = 'overlay-scrollbar';
export const ownScrollbarAttribute = 'data-own-vertical-scrollbar';

export function drawsOverlay(axis: Axis, ownsVertical: boolean): boolean {
  return axis === 'horizontal' || !ownsVertical;
}

export function followedScroller<T>(
  dragging: boolean,
  current: T | null,
  hovered: T | null,
): T | null {
  return dragging ? current : hovered;
}

export function scrolledScroller<T>(
  current: T | null,
  shown: boolean,
  scrolled: unknown,
  scrollerOfScrolled: () => T | null,
): T | null | undefined {
  if (current === scrolled) {
    return current;
  }
  return shown ? undefined : scrollerOfScrolled();
}

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
    const sideways = axis === 'horizontal' && sidewaysScrollerOf(element);
    if (sideways) {
      const metrics = sideways.metrics();
      return metrics.scrollWidth > metrics.clientWidth + 1 ? element : null;
    }
    if (scrollsAlong(element, axis)) {
      return drawsOverlay(axis, element.hasAttribute(ownScrollbarAttribute))
        ? element
        : null;
    }
    element = element.parentElement;
  }
  return null;
}

function metricsOf(scroller: Element, axis: Axis): ScrollerMetrics {
  const sideways = axis === 'horizontal' && sidewaysScrollerOf(scroller);
  const metrics = sideways ? sideways.metrics() : elementMetrics(scroller);
  return framedMetrics(metrics, frameOf(scroller, metrics));
}

function barSize(): number {
  return parseFloat(
    getComputedStyle(document.body).getPropertyValue('--scrollbar-size'),
  );
}

class Bar {
  readonly element = document.createElement('div');
  scroller: Element | null = null;
  private timer: number | undefined;
  private dragging = false;

  constructor(readonly axis: Axis) {
    this.element.className = `${overlayScrollbarClass} ${axis}`;
    this.element.addEventListener('pointerdown', this.onPointerDown);
    this.element.addEventListener('pointerenter', () =>
      window.clearTimeout(this.timer),
    );
    this.element.addEventListener('pointerleave', () => this.hideLater());
    document.body.append(this.element);
  }

  show(scroller: Element | null): void {
    this.scroller = followedScroller(this.dragging, this.scroller, scroller);
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
    const box = thumbBox(this.axis, metricsOf(scroller, this.axis), barSize());
    if (!box) {
      return false;
    }
    const { style } = this.element;
    style.left = `${box.left}px`;
    style.top = `${box.top}px`;
    style.width = `${box.width}px`;
    style.height = `${box.height}px`;
    style.setProperty('clip-path', clipPathOf(this.axis, box.clip));
    return true;
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.element.classList.remove('shown');
  }

  get shown(): boolean {
    return (
      this.element.classList.contains('shown') &&
      this.scroller?.isConnected === true
    );
  }

  private hideLater(): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      if (!this.dragging && !this.element.matches(':hover')) {
        this.hide();
      }
    }, hideAfter);
  }

  pressTrack(scroller: Element, event: PointerEvent): boolean {
    const metrics = metricsOf(scroller, this.axis);
    const track = trackBox(this.axis, metrics, barSize());
    if (!track || !contains(track, event)) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    this.scroller = scroller;
    this.scroll(scroller, jumpedScroll(this.axis, metrics, event));
    this.follow(
      scroller,
      event,
      (pointer) => jumpedScroll(this.axis, metrics, pointer),
      'track',
    );
    this.show(scroller);
    return true;
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    const { scroller } = this;
    if (!scroller || !clicked(keymap.drag, event)) {
      return;
    }
    event.preventDefault();
    const drag = dragFrom(this.axis, metricsOf(scroller, this.axis), event);
    this.follow(
      scroller,
      event,
      (pointer) => draggedScroll(this.axis, drag, pointer),
      'thumb',
    );
  };

  private follow(
    scroller: Element,
    event: PointerEvent,
    scrollAt: (pointer: PointerEvent) => number,
    drag: ScrollbarDrag,
  ): void {
    this.element.setPointerCapture(event.pointerId);
    this.element.classList.add('dragging');
    this.dragging = true;
    scrollbarDrags.set(scroller, drag);
    followDrag(
      this.element,
      (pointer: PointerEvent) => this.scroll(scroller, scrollAt(pointer)),
      () => {
        this.dragging = false;
        scrollbarDrags.delete(scroller);
        this.element.classList.remove('dragging');
        this.hideLater();
      },
    );
  }

  private scroll(scroller: Element, scroll: number): void {
    const sideways = sidewaysScrollerOf(scroller);
    const rows = rowScrollerOf(scroller);
    if (this.axis === 'vertical' && rows) {
      rows(scroll);
    } else if (this.axis === 'vertical') {
      scroller.scrollTop = scroll;
    } else if (sideways) {
      sideways.scrollTo(scroll);
    } else {
      scroller.scrollLeft = scroll;
    }
  }
}

export function installOverlayScrollbars(): void {
  const bars = [new Bar('vertical'), new Bar('horizontal')] as const;
  const showFor = (target: EventTarget | null) => {
    if (
      bars.some((bar) => bar.element === target) ||
      (target instanceof Element && !target.isConnected)
    ) {
      return;
    }
    bars[0].show(scrollerOf(target, 'vertical'));
    bars[1].show(scrollerOf(target, 'horizontal'));
  };
  let pointed: EventTarget | null = null;
  const pointing = afterPaint(() => showFor(pointed));
  for (const type of ['pointermove', 'pointerover']) {
    document.addEventListener(
      type,
      (event) => {
        pointed = event.target;
        pointing.ask();
      },
      { passive: true },
    );
  }
  let scrolled: EventTarget | null = null;
  const scrolling = inNextFrame(() => onScroll(scrolled));
  const onScroll = (target: EventTarget | null) => {
    for (const bar of bars) {
      const scroller = scrolledScroller(bar.scroller, bar.shown, target, () =>
        scrollerOf(target, bar.axis),
      );
      if (scroller !== undefined) {
        bar.show(scroller);
      }
    }
  };
  for (const type of ['scroll', sidewaysScrollEvent]) {
    document.addEventListener(
      type,
      ({ target }) => {
        scrolled = target;
        scrolling.ask();
      },
      { capture: true, passive: true },
    );
  }
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!clicked(keymap.drag, event)) {
        return;
      }
      for (const bar of bars) {
        const scroller = scrollerOf(event.target, bar.axis);
        if (scroller && bar.pressTrack(scroller, event)) {
          return;
        }
      }
    },
    { capture: true },
  );
  window.addEventListener('resize', () => bars.forEach((bar) => bar.hide()));
}
