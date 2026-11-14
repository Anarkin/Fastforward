import type { ScrollerMetrics, Track } from './scrollbarGeometry';

export const pixels = (value: string) => parseFloat(value) || 0;

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

function paddingOf(
  style: Pick<
    CSSStyleDeclaration,
    | 'scrollPaddingTop'
    | 'scrollPaddingBottom'
    | 'scrollPaddingLeft'
    | 'scrollPaddingRight'
  >,
): Track {
  return {
    top: pixels(style.scrollPaddingTop),
    bottom: pixels(style.scrollPaddingBottom),
    left: pixels(style.scrollPaddingLeft),
    right: pixels(style.scrollPaddingRight),
  };
}

function refined(whole: number, measured: number): number {
  return measured > 0 && Math.abs(measured - whole) < 1 ? measured : whole;
}

export function elementMetrics(scroller: Element): ScrollerMetrics {
  const { left, top, width, height } = scroller.getBoundingClientRect();
  const style = getComputedStyle(scroller);
  return {
    left,
    top,
    clientLeft: scroller.clientLeft,
    clientTop: scroller.clientTop,
    clientWidth: refined(
      scroller.clientWidth,
      width - scroller.clientLeft - pixels(style.borderRightWidth),
    ),
    clientHeight: refined(
      scroller.clientHeight,
      height - scroller.clientTop - pixels(style.borderBottomWidth),
    ),
    scrollWidth: scroller.scrollWidth,
    scrollHeight: scroller.scrollHeight,
    scrollLeft: scroller.scrollLeft,
    scrollTop: scroller.scrollTop,
    track: trackOf(style),
    padding: paddingOf(style),
  };
}
