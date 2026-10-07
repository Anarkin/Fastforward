export const scrollCap = 8_000_000;
const edgeZone = 1_000_000;

export interface ScrollRange {
  readonly total: number;
  readonly viewport: number;
}

export interface ScrollAnchor {
  readonly real: number;
  readonly base: number;
}

export function realHeight(total: number): number {
  return Math.min(total, scrollCap);
}

type Spans = ReturnType<typeof spansOf>;

function spansOf({ total, viewport }: ScrollRange) {
  const real = Math.max(0, realHeight(total) - viewport);
  return {
    real,
    virtual: Math.max(0, total - viewport),
    edge: Math.min(edgeZone, real / 4),
  };
}

function homeBase(real: number, spans: Spans): number {
  if (real <= spans.edge) {
    return 0;
  }
  if (real >= spans.real - spans.edge) {
    return spans.virtual - spans.real;
  }
  return (
    spans.edge +
    ((real - spans.edge) * (spans.virtual - 2 * spans.edge)) /
      (spans.real - 2 * spans.edge) -
    real
  );
}

export function homeVirtual(real: number, range: ScrollRange): number {
  return real + homeBase(real, spansOf(range));
}

export function homeReal(virtual: number, range: ScrollRange): number {
  const spans = spansOf(range);
  if (virtual <= spans.edge) {
    return virtual;
  }
  if (virtual >= spans.virtual - spans.edge) {
    return virtual - (spans.virtual - spans.real);
  }
  return (
    spans.edge +
    ((virtual - spans.edge) * (spans.real - 2 * spans.edge)) /
      (spans.virtual - 2 * spans.edge)
  );
}

function home(virtual: number, range: ScrollRange): ScrollAnchor {
  const spans = spansOf(range);
  if (virtual <= spans.edge) {
    return { real: virtual, base: 0 };
  }
  const bottom = spans.virtual - spans.real;
  if (virtual >= spans.virtual - spans.edge) {
    return { real: virtual - bottom, base: bottom };
  }
  const real = Math.round(homeReal(virtual, range));
  return { real, base: virtual - real };
}

function unstuck(anchor: ScrollAnchor, range: ScrollRange): ScrollAnchor {
  const spans = spansOf(range);
  const stuck =
    (anchor.real < 1 && anchor.base > 0) ||
    (anchor.real > spans.real - 1 && anchor.base < spans.virtual - spans.real);
  return stuck ? home(anchor.real + anchor.base, range) : anchor;
}

export function scrolled(
  anchor: ScrollAnchor,
  real: number,
  range: ScrollRange,
): ScrollAnchor {
  if (range.total <= scrollCap) {
    return { real, base: 0 };
  }
  const spans = spansOf(range);
  if (Math.abs(real - anchor.real) > range.viewport) {
    return { real, base: homeBase(real, spans) };
  }
  const base = Math.min(Math.max(anchor.base, 0), spans.virtual - spans.real);
  return unstuck({ real, base }, range);
}

export function scrolledTo(
  anchor: ScrollAnchor,
  virtual: number,
  range: ScrollRange,
): ScrollAnchor {
  if (range.total <= scrollCap) {
    return { real: virtual, base: 0 };
  }
  const spans = spansOf(range);
  const target = Math.min(Math.max(virtual, 0), spans.virtual);
  const real = target - anchor.base;
  return Math.abs(real - anchor.real) > range.viewport ||
    real < 0 ||
    real > spans.real ||
    anchor.base > spans.virtual - spans.real
    ? home(target, range)
    : unstuck({ real, base: anchor.base }, range);
}
