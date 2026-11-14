import type { ScrollerMetrics } from '../../../lib/page/scrollbarGeometry';

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
