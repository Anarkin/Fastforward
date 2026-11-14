import { pixels } from './scrollerMetrics';
import {
  noTrackInsets,
  type ScrollerMetrics,
  type Track,
} from './scrollbarGeometry';

export interface Frame {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly line: number;
  readonly radius: number;
}

export function paintedFrame(frame: Frame, ratio: number): Frame {
  const snapped = (value: number) => Math.round(value * ratio) / ratio;
  return {
    left: snapped(frame.left),
    top: snapped(frame.top),
    right: snapped(frame.right),
    bottom: snapped(frame.bottom),
    line: Math.floor(frame.line * ratio + 0.001) / ratio,
    radius: frame.radius,
  };
}

function meets(one: number, other: number): boolean {
  return Math.abs(one - other) <= 1;
}

function sharedEdges(
  metrics: ScrollerMetrics,
  frame: Frame,
): Record<keyof Track, boolean> {
  const left = metrics.left + metrics.clientLeft;
  const top = metrics.top + metrics.clientTop;
  return {
    left: meets(left, frame.left),
    top: meets(top, frame.top),
    right: meets(left + metrics.clientWidth, frame.right),
    bottom: meets(top + metrics.clientHeight, frame.bottom),
  };
}

function sharesEdge(metrics: ScrollerMetrics, frame: Frame): boolean {
  return Object.values(sharedEdges(metrics, frame)).some(Boolean);
}

export function framedMetrics(
  metrics: ScrollerMetrics,
  frame: Frame | undefined,
): ScrollerMetrics {
  if (frame === undefined || !sharesEdge(metrics, frame)) {
    return metrics;
  }
  const at = sharedEdges(metrics, frame);
  const left = metrics.left + metrics.clientLeft;
  const top = metrics.top + metrics.clientTop;
  const right = left + metrics.clientWidth;
  const bottom = top + metrics.clientHeight;
  const inset: Track = {
    top: frame.top + frame.line - top,
    bottom: bottom - (frame.bottom - frame.line),
    left: frame.left + frame.line - left,
    right: right - (frame.right - frame.line),
  };
  const inner = Math.max(0, frame.radius - frame.line);
  const own = metrics.track ?? noTrackInsets;
  const padding = metrics.padding ?? own;
  const end = (side: keyof Track) =>
    !at[side]
      ? own[side]
      : padding[side] > 0
        ? Math.max(padding[side], inset[side])
        : inset[side];
  const track: Track = {
    top: end('top'),
    bottom: end('bottom'),
    left: end('left'),
    right: end('right'),
  };
  const bend = (side: keyof Track, corner: boolean) =>
    at[side] && corner && track[side] - inset[side] < 0.5 ? inner : 0;
  return {
    ...metrics,
    track,
    edges: {
      right: at.right ? inset.right : 0,
      bottom: at.bottom ? inset.bottom : 0,
    },
    bends: {
      top: bend('top', at.right),
      bottom: bend('bottom', at.right),
      left: bend('left', at.bottom),
      right: bend('right', at.bottom),
    },
  };
}

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
