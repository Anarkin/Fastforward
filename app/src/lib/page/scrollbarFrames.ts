import { pixels } from './scrollerMetrics';
import {
  Frame,
  paintedFrame,
  ScrollerMetrics,
  sharesEdge,
} from './scrollbarGeometry';

function radiusOf(style: CSSStyleDeclaration): number {
  return Math.max(
    pixels(style.borderTopLeftRadius),
    pixels(style.borderTopRightRadius),
    pixels(style.borderBottomRightRadius),
    pixels(style.borderBottomLeftRadius),
  );
}

interface Framing {
  readonly lined: readonly Element[];
  readonly rounded: readonly Element[];
}

const framings = new WeakMap<Element, Framing>();

function lineOf(element: Element): number {
  return pixels(
    getComputedStyle(element, '::after').getPropertyValue('--frame-line'),
  );
}

function framingOf(scroller: Element): Framing {
  const known = framings.get(scroller);
  if (
    known !== undefined &&
    [...known.lined, ...known.rounded].every((element) => element.isConnected)
  ) {
    return known;
  }
  const lined: Element[] = [];
  const rounded: Element[] = [];
  for (
    let element = scroller.parentElement;
    element !== null && element !== document.body;
    element = element.parentElement
  ) {
    if (lineOf(element) > 0) {
      lined.push(element);
    } else if (radiusOf(getComputedStyle(element)) > 0) {
      rounded.push(element);
    }
  }
  const framing = { lined, rounded };
  framings.set(scroller, framing);
  return framing;
}

function frameFrom(element: Element, line: number): Frame {
  const { left, top, right, bottom } = element.getBoundingClientRect();
  return paintedFrame(
    {
      left,
      top,
      right,
      bottom,
      line,
      radius: radiusOf(getComputedStyle(element)),
    },
    window.devicePixelRatio,
  );
}

function borderOf(element: Element): number {
  return pixels(getComputedStyle(element).borderRightWidth);
}

export function frameOf(
  scroller: Element,
  metrics: ScrollerMetrics,
): Frame | undefined {
  const { lined, rounded } = framingOf(scroller);
  const shared = [
    ...lined.map((element) => frameFrom(element, lineOf(element))),
    ...rounded.map((element) => frameFrom(element, borderOf(element))),
  ].find((frame) => sharesEdge(metrics, frame));
  if (shared !== undefined) {
    return shared;
  }
  return radiusOf(getComputedStyle(scroller)) > 0
    ? frameFrom(scroller, borderOf(scroller))
    : undefined;
}
