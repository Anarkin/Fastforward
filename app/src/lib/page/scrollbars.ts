import { clicked, pressedAlone, released } from '../shared/keymap';
import { keymap } from './keymap';
import {
  columnScrollerOf,
  plainStep,
  rowScrollerOf,
  scrollbarCovered,
  scrollbarDrags,
  wheeledAround,
  type HeldScroller,
  type ScrollbarDrag,
} from './scrollbarLinks';
import { followDrag } from './followDrag';
import { afterPaint, inNextFrame } from './afterPaint';
import {
  draggedFrom,
  jumpedTo,
  partAt,
  partsOf,
  type Parts,
  type Scrolled,
} from './scrollbarParts';

type Axis = 'vertical' | 'horizontal';

export const scrollbarCoverClass = 'scrollbar-cover';
export const scrollbarHoverAttribute = 'data-scrollbar-hover';
export const scrollbarHeldAttribute = 'data-scrollbar-held';

const stepWait = 400;
const stepEvery = 60;

interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function pixels(value: string): number {
  return parseFloat(value) || 0;
}

function barBox(axis: Axis, scroller: Element): Box | undefined {
  const { left, top, width, height } = scroller.getBoundingClientRect();
  const style = getComputedStyle(scroller);
  const box =
    axis === 'vertical'
      ? {
          left: left + scroller.clientLeft + scroller.clientWidth,
          top: top + scroller.clientTop,
          width:
            width -
            scroller.clientLeft -
            scroller.clientWidth -
            pixels(style.borderRightWidth),
          height: scroller.clientHeight,
        }
      : {
          left: left + scroller.clientLeft,
          top: top + scroller.clientTop + scroller.clientHeight,
          width: scroller.clientWidth,
          height:
            height -
            scroller.clientTop -
            scroller.clientHeight -
            pixels(style.borderBottomWidth),
        };
  return (axis === 'vertical' ? box.width : box.height) >= 1 ? box : undefined;
}

function scrolledOf(axis: Axis, scroller: Element): Scrolled {
  return axis === 'vertical'
    ? {
        scrollSize: scroller.scrollHeight,
        clientSize: scroller.clientHeight,
        scrolled: scroller.scrollTop,
      }
    : {
        scrollSize: scroller.scrollWidth,
        clientSize: scroller.clientWidth,
        scrolled: scroller.scrollLeft,
      };
}

function scrollsAlong(element: Element, axis: Axis): boolean {
  const style = getComputedStyle(element);
  const overflow = axis === 'vertical' ? style.overflowY : style.overflowX;
  return (
    (overflow === 'auto' || overflow === 'scroll') &&
    barBox(axis, element) !== undefined
  );
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

const listLayer = 20;

export function layerOver(zIndexes: readonly string[]): number {
  return (
    zIndexes.reduce((top, zIndex) => {
      const layer = Number.parseInt(zIndex, 10);
      return Number.isFinite(layer) ? Math.max(top, layer) : top;
    }, listLayer - 1) + 1
  );
}

function zIndexesAround(element: Element): string[] {
  const found: string[] = [];
  for (let at: Element | null = element; at !== null; at = at.parentElement) {
    found.push(getComputedStyle(at).zIndex);
  }
  return found;
}

interface Place {
  readonly box: Box;
  readonly parts: Parts;
  readonly layer: number;
}

const partNames = ['start', 'thumb', 'end'] as const;

type Named = (typeof partNames)[number];

function heldOf(axis: Axis, scroller: Element): HeldScroller | undefined {
  return axis === 'vertical'
    ? rowScrollerOf(scroller)
    : columnScrollerOf(scroller);
}

function scrollTo(axis: Axis, scroller: Element, to: number): void {
  const held = heldOf(axis, scroller);
  if (held) {
    held.dragTo(to);
  } else if (axis === 'vertical') {
    scroller.scrollTop = to;
  } else {
    scroller.scrollLeft = to;
  }
}

function stepBy(axis: Axis, scroller: Element, steps: number): void {
  if (heldOf(axis, scroller)?.stepBy?.(steps) === true) {
    return;
  }
  if (axis === 'vertical') {
    scroller.scrollTop += steps * plainStep;
  } else {
    scroller.scrollLeft += steps * plainStep;
  }
}

class Cover {
  readonly element = document.createElement('div');
  scroller: Element | null = null;
  private readonly parts = new Map<Named, HTMLElement>();
  private dragging = false;
  private from = 0;
  private hovered: Named | undefined;
  private stepping: ReturnType<typeof setTimeout> | undefined;

  constructor(readonly axis: Axis) {
    this.element.className = `${scrollbarCoverClass} ${axis}`;
    for (const name of partNames) {
      const part = document.createElement('div');
      part.className = `scrollbar-${name}`;
      part.addEventListener('pointerenter', () => this.mark(name));
      part.addEventListener('pointerleave', () => this.mark(undefined));
      this.parts.set(name, part);
      this.element.append(part);
    }
    const again = inNextFrame(this.placedAgain);
    this.element.addEventListener('pointermove', again.ask);
    this.element.addEventListener('pointerdown', this.onPointerDown);
    this.element.addEventListener('wheel', this.onWheel, { passive: false });
    document.body.append(this.element);
  }

  get busy(): boolean {
    return this.dragging || this.stepping !== undefined;
  }

  get shown(): boolean {
    return (
      this.element.classList.contains('shown') &&
      this.scroller?.isConnected === true
    );
  }

  placeFor(scroller: Element | null): Place | undefined {
    if (!this.busy) {
      this.follow(scroller);
    }
    const followed = this.scroller;
    if (!followed?.isConnected) {
      return undefined;
    }
    const box = barBox(this.axis, followed);
    return (
      box && {
        box,
        parts: this.partsIn(box, followed),
        layer: layerOver(zIndexesAround(followed)),
      }
    );
  }

  put(place: Place | undefined): void {
    if (!place) {
      this.hide();
      return;
    }
    const { box, parts, layer } = place;
    const { style } = this.element;
    style.left = `${box.left}px`;
    style.top = `${box.top}px`;
    style.width = `${box.width}px`;
    style.height = `${box.height}px`;
    style.zIndex = String(layer);
    for (const name of partNames) {
      const extent = parts[name];
      const part = this.parts.get(name);
      if (part) {
        part.hidden = extent === undefined;
        const [from, length] =
          this.axis === 'vertical' ? ['top', 'height'] : ['left', 'width'];
        part.style.setProperty(from, `${extent?.from ?? 0}px`);
        part.style.setProperty(length, `${extent?.length ?? 0}px`);
      }
    }
    this.element.classList.add('shown');
  }

  hide(): void {
    if (this.busy) {
      return;
    }
    this.mark(undefined);
    this.element.classList.remove('shown');
  }

  private readonly placedAgain = () => {
    if (!this.busy && this.element.classList.contains('shown')) {
      this.put(this.placeFor(this.scroller));
    }
  };

  private readonly watching = new ResizeObserver(this.placedAgain);

  private follow(scroller: Element | null): void {
    if (scroller !== this.scroller) {
      this.mark(undefined);
      if (this.scroller) {
        this.watching.unobserve(this.scroller);
      }
      this.scroller = scroller;
      if (scroller) {
        this.watching.observe(scroller);
        scrollbarCovered.set(this.element, scroller);
      } else {
        scrollbarCovered.delete(this.element);
      }
    }
  }

  private partsIn(box: Box, scroller: Element): Parts {
    const scrolled = scrolledOf(this.axis, scroller);
    return this.axis === 'vertical'
      ? partsOf(box.height, box.width, scrolled, devicePixelRatio)
      : partsOf(box.width, box.height, scrolled, devicePixelRatio);
  }

  private mark(part: Named | undefined): void {
    this.hovered = part;
    this.marked();
  }

  private marked(): void {
    const { scroller, hovered: part } = this;
    if (!scroller || this.busy) {
      return;
    }
    if (part === undefined) {
      scroller.removeAttribute(scrollbarHoverAttribute);
    } else {
      scroller.setAttribute(scrollbarHoverAttribute, `${this.axis}-${part}`);
    }
  }

  private hold(scroller: Element, part: Named | undefined): void {
    if (part === undefined) {
      scroller.removeAttribute(scrollbarHeldAttribute);
    } else {
      scroller.setAttribute(scrollbarHeldAttribute, `${this.axis}-${part}`);
    }
  }

  private along(pointer: { clientX: number; clientY: number }): number {
    return (
      (this.axis === 'vertical' ? pointer.clientY : pointer.clientX) - this.from
    );
  }

  private lies(pointer: { clientX: number; clientY: number }): boolean {
    const under = document
      .elementsFromPoint(pointer.clientX, pointer.clientY)
      .find((element) => !element.closest(`.${scrollbarCoverClass}`));
    return under === this.scroller;
  }

  private readonly onWheel = (event: WheelEvent) => {
    const { scroller } = this;
    if (!scroller) {
      return;
    }
    if (!this.busy && !this.lies(event)) {
      this.hide();
      return;
    }
    for (const turn of wheeledAround(scroller)) {
      if (!event.defaultPrevented) {
        turn(event);
      }
    }
    if (event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    if (pressedAlone(event)) {
      scroller.scrollBy(event.deltaX, event.deltaY);
    }
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    const { scroller } = this;
    event.preventDefault();
    if (!scroller || !clicked(keymap.drag, event)) {
      return;
    }
    if (!this.lies(event)) {
      this.hide();
      return;
    }
    const box = barBox(this.axis, scroller);
    if (!box) {
      return;
    }
    const own = this.element.getBoundingClientRect();
    this.from = this.axis === 'vertical' ? own.top : own.left;
    const parts = this.partsIn(box, scroller);
    const scrolled = scrolledOf(this.axis, scroller);
    const along = this.along(event);
    const part = partAt(parts, along);
    if (part === 'start' || part === 'end') {
      this.step(scroller, event, part);
    } else if (part === 'thumb') {
      const drag = draggedFrom(parts, scrolled, along);
      this.drag(
        scroller,
        event,
        (pointer) => drag(this.along(pointer)),
        'thumb',
      );
    } else if (parts.thumb !== undefined) {
      const jump = (pointer: { clientX: number; clientY: number }) =>
        jumpedTo(parts, scrolled, this.along(pointer));
      scrollTo(this.axis, scroller, jump(event));
      this.drag(scroller, event, jump, 'track');
    }
  };

  private step(scroller: Element, event: PointerEvent, part: Named): void {
    const steps = part === 'start' ? -1 : 1;
    const button = this.parts.get(part);
    let over = true;
    const again = () => {
      if (over) {
        stepBy(this.axis, scroller, steps);
      }
      this.stepping = setTimeout(again, stepEvery);
    };
    this.element.setPointerCapture(event.pointerId);
    stepBy(this.axis, scroller, steps);
    this.stepping = setTimeout(again, stepWait);
    this.hold(scroller, part);
    followDrag(
      this.element,
      (pointer: PointerEvent) => {
        const box = button?.getBoundingClientRect();
        over =
          box !== undefined &&
          pointer.clientX >= box.left &&
          pointer.clientX < box.right &&
          pointer.clientY >= box.top &&
          pointer.clientY < box.bottom;
      },
      () => {
        clearTimeout(this.stepping);
        this.stepping = undefined;
        this.hold(scroller, undefined);
        this.marked();
      },
    );
  }

  private drag(
    scroller: Element,
    event: PointerEvent,
    scrollAt: (pointer: PointerEvent) => number,
    kind: ScrollbarDrag,
  ): void {
    this.element.setPointerCapture(event.pointerId);
    this.element.classList.add('dragging');
    this.dragging = true;
    this.hold(scroller, 'thumb');
    scrollbarDrags.set(scroller, kind);
    followDrag(
      this.element,
      (pointer: PointerEvent) =>
        scrollTo(this.axis, scroller, scrollAt(pointer)),
      () => {
        this.dragging = false;
        heldOf(this.axis, scroller)?.dragEnd();
        scrollbarDrags.delete(scroller);
        this.hold(scroller, undefined);
        this.element.classList.remove('dragging');
        this.marked();
      },
    );
  }
}

function overBar(event: PointerEvent): boolean {
  const { target } = event;
  return (
    target instanceof Element &&
    (target.clientWidth > 0 || target.clientHeight > 0) &&
    (event.offsetX >= target.clientWidth ||
      event.offsetY >= target.clientHeight)
  );
}

export function installScrollbars(): void {
  const covers = [new Cover('vertical'), new Cover('horizontal')] as const;
  const showFor = (target: EventTarget | null) => {
    if (
      (target instanceof Node &&
        covers.some((cover) => cover.element.contains(target))) ||
      (target instanceof Element && !target.isConnected)
    ) {
      return;
    }
    const places = covers.map((cover) =>
      cover.placeFor(scrollerOf(target, cover.axis)),
    );
    covers.forEach((cover, index) => cover.put(places[index]));
  };
  let pointed: EventTarget | null = null;
  const pointing = afterPaint(() => showFor(pointed));
  const cameOver = (event: PointerEvent) => {
    const came = event.target !== pointed;
    pointed = event.target;
    return came && overBar(event);
  };
  for (const type of ['pointermove', 'pointerover'] as const) {
    document.addEventListener(
      type,
      (event) => {
        if (!released(event)) {
          return;
        }
        if (cameOver(event)) {
          showFor(pointed);
        } else {
          pointing.ask();
        }
      },
      { passive: true },
    );
  }
  let scrolled: EventTarget | null = null;
  const scrolling = inNextFrame(() => {
    const places = covers.map((cover) =>
      cover.shown && cover.scroller === scrolled
        ? cover.placeFor(cover.scroller)
        : undefined,
    );
    covers.forEach((cover, index) => {
      const place = places[index];
      if (place) {
        cover.put(place);
      }
    });
  });
  document.addEventListener(
    'scroll',
    ({ target }) => {
      if (covers.some((cover) => cover.shown && cover.scroller === target)) {
        scrolled = target;
        scrolling.ask();
      }
    },
    { capture: true, passive: true },
  );
  window.addEventListener('resize', () =>
    covers.forEach((cover) => cover.hide()),
  );
}
