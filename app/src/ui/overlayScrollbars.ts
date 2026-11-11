import { clicked, keymap } from '../shell/shared/keymap';
import { scrollbarDrags, type ScrollbarDrag } from './cappedScroll';
import { followDrag } from './followDrag';
import { afterPaint, inNextFrame } from './afterPaint';

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
  track = clientSize,
): Thumb | undefined {
  if (scrollSize <= clientSize + 1) {
    return undefined;
  }
  const length = Math.min(
    track,
    Math.max(minThumb, (track * clientSize) / scrollSize),
  );
  const range = scrollSize - clientSize;
  const offset =
    ((track - length) * Math.min(Math.max(scrolled, 0), range)) / range;
  return { offset, length };
}

export function scrollPerPixel(
  scrollSize: number,
  clientSize: number,
  track = clientSize,
): number {
  const thumb = thumbOf(scrollSize, clientSize, 0, track);
  const room = thumb ? track - thumb.length : 0;
  return room > 0 ? (scrollSize - clientSize) / room : 0;
}

export interface Track {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

const noTrackInsets: Track = { top: 0, bottom: 0, left: 0, right: 0 };

const pixels = (value: string) => parseFloat(value) || 0;

export function trackOf(
  style: Pick<
    CSSStyleDeclaration,
    | 'scrollPaddingTop'
    | 'scrollPaddingBottom'
    | 'scrollPaddingLeft'
    | 'scrollPaddingRight'
    | 'borderTopRightRadius'
    | 'borderBottomRightRadius'
    | 'borderBottomLeftRadius'
  >,
): Track {
  return {
    top: Math.max(
      pixels(style.scrollPaddingTop),
      pixels(style.borderTopRightRadius),
    ),
    bottom: Math.max(
      pixels(style.scrollPaddingBottom),
      pixels(style.borderBottomRightRadius),
    ),
    left: Math.max(
      pixels(style.scrollPaddingLeft),
      pixels(style.borderBottomLeftRadius),
    ),
    right: Math.max(
      pixels(style.scrollPaddingRight),
      pixels(style.borderBottomRightRadius),
    ),
  };
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

export interface SidewaysScroller {
  readonly metrics: () => ScrollerMetrics;
  readonly scrollTo: (scrollLeft: number) => void;
}

const sidewaysScrollers = new WeakMap<Element, SidewaysScroller>();

export const sidewaysScrollEvent = 'sidewaysscroll';

export function setSidewaysScroller(
  element: Element,
  scroller: SidewaysScroller | undefined,
): void {
  if (scroller) {
    sidewaysScrollers.set(element, scroller);
  } else {
    sidewaysScrollers.delete(element);
  }
}

const rowScrollers = new WeakMap<Element, (scrollTop: number) => void>();

export function setRowScroller(
  element: Element,
  dragTo: ((scrollTop: number) => void) | undefined,
): void {
  if (dragTo) {
    rowScrollers.set(element, dragTo);
  } else {
    rowScrollers.delete(element);
  }
}

export function sidewaysMetrics(
  area: ScrollerMetrics,
  side: number,
  widest: number,
  scrolled: number,
): ScrollerMetrics {
  const scale = side > 0 ? area.clientWidth / side : 0;
  return {
    ...area,
    scrollWidth: area.clientWidth + widest * scale,
    scrollLeft: scrolled * scale,
  };
}

export function sidewaysScroll(
  scrollLeft: number,
  clientWidth: number,
  side: number,
): number {
  return clientWidth > 0 ? (scrollLeft * side) / clientWidth : 0;
}

function scrollerOf(target: EventTarget | null, axis: Axis): Element | null {
  let element = target instanceof Element ? target : null;
  while (element && element !== document.documentElement) {
    const sideways = axis === 'horizontal' && sidewaysScrollers.get(element);
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
  readonly track?: Track;
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
  const track = scroller.track ?? noTrackInsets;
  if (axis === 'vertical') {
    const thumb = thumbOf(
      scroller.scrollHeight,
      scroller.clientHeight,
      scroller.scrollTop,
      verticalTrack(scroller),
    );
    return (
      thumb && {
        left: left + scroller.clientWidth - size,
        top: top + track.top + thumb.offset,
        width: size,
        height: thumb.length,
      }
    );
  }
  const thumb = thumbOf(
    scroller.scrollWidth,
    scroller.clientWidth,
    scroller.scrollLeft,
    horizontalTrack(scroller),
  );
  return (
    thumb && {
      left: left + track.left + thumb.offset,
      top: top + scroller.clientHeight - size,
      width: thumb.length,
      height: size,
    }
  );
}

export function trackBox(
  axis: Axis,
  scroller: ScrollerMetrics,
  size: number,
): ThumbBox | undefined {
  if (!thumbBox(axis, scroller, size)) {
    return undefined;
  }
  const left = scroller.left + scroller.clientLeft;
  const top = scroller.top + scroller.clientTop;
  const track = scroller.track ?? noTrackInsets;
  return axis === 'vertical'
    ? {
        left: left + scroller.clientWidth - size,
        top: top + track.top,
        width: size,
        height: verticalTrack(scroller),
      }
    : {
        left: left + track.left,
        top: top + scroller.clientHeight - size,
        width: horizontalTrack(scroller),
        height: size,
      };
}

function contains(
  box: ThumbBox,
  pointer: { readonly clientX: number; readonly clientY: number },
): boolean {
  return (
    pointer.clientX >= box.left &&
    pointer.clientX < box.left + box.width &&
    pointer.clientY >= box.top &&
    pointer.clientY < box.top + box.height
  );
}

export function shareAt(
  pointer: number,
  start: number,
  track: number,
  length: number,
  grab = length / 2,
): number {
  const room = track - length;
  return room > 0
    ? Math.min(Math.max((pointer - start - grab) / room, 0), 1)
    : 0;
}

export function grabbedAt(
  pointer: number,
  thumb: { readonly top: number; readonly height: number },
): number {
  return pointer >= thumb.top && pointer <= thumb.top + thumb.height
    ? pointer - thumb.top
    : thumb.height / 2;
}

export function jumpedScroll(
  axis: Axis,
  scroller: ScrollerMetrics,
  pointer: { readonly clientX: number; readonly clientY: number },
): number {
  const track = scroller.track ?? noTrackInsets;
  const [scrollSize, clientSize, along, start, length] =
    axis === 'vertical'
      ? [
          scroller.scrollHeight,
          scroller.clientHeight,
          pointer.clientY,
          scroller.top + scroller.clientTop + track.top,
          verticalTrack(scroller),
        ]
      : [
          scroller.scrollWidth,
          scroller.clientWidth,
          pointer.clientX,
          scroller.left + scroller.clientLeft + track.left,
          horizontalTrack(scroller),
        ];
  const thumb = thumbOf(scrollSize, clientSize, 0, length);
  return thumb
    ? shareAt(along, start, length, thumb.length) * (scrollSize - clientSize)
    : 0;
}

function verticalTrack({ clientHeight, track }: ScrollerMetrics): number {
  return Math.max(0, clientHeight - (track?.top ?? 0) - (track?.bottom ?? 0));
}

function horizontalTrack({ clientWidth, track }: ScrollerMetrics): number {
  return Math.max(0, clientWidth - (track?.left ?? 0) - (track?.right ?? 0));
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
        ratio: scrollPerPixel(
          scroller.scrollHeight,
          scroller.clientHeight,
          verticalTrack(scroller),
        ),
      }
    : {
        pointer: pointer.clientX,
        scroll: scroller.scrollLeft,
        ratio: scrollPerPixel(
          scroller.scrollWidth,
          scroller.clientWidth,
          horizontalTrack(scroller),
        ),
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

function metricsOf(scroller: Element, axis: Axis): ScrollerMetrics {
  const sideways = axis === 'horizontal' && sidewaysScrollers.get(scroller);
  return sideways ? sideways.metrics() : elementMetrics(scroller);
}

export function elementMetrics(scroller: Element): ScrollerMetrics {
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
    track: trackOf(getComputedStyle(scroller)),
  };
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
    const sideways = sidewaysScrollers.get(scroller);
    const rows = rowScrollers.get(scroller);
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
