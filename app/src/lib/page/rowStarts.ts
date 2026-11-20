const onStart = 0.01;

function firstStartFrom(
  startOf: (index: number) => number,
  count: number,
  top: number,
  near: number,
): number {
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (startOf(middle) < top - near) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

export function snappedToStart(
  startOf: (index: number) => number,
  count: number,
  top: number,
  toward: number,
  max: number,
  near = onStart,
): number {
  if (count === 0) {
    return Math.max(0, Math.min(max, top));
  }
  const next = firstStartFrom(startOf, count, top, near);
  if (next === count && toward >= 0) {
    return Math.max(0, max);
  }
  const onIt = next < count && Math.abs(startOf(next) - top) <= near;
  const index =
    toward < 0 && !onIt ? Math.max(0, next - 1) : Math.min(count - 1, next);
  return Math.max(0, Math.min(max, startOf(index)));
}

export function endPaddingToStart(
  startOf: (index: number) => number,
  count: number,
  contentEnd: number,
  room: number,
): number {
  const last = contentEnd - room;
  if (last <= 0 || count === 0) {
    return 0;
  }
  const next = firstStartFrom(startOf, count, last, onStart);
  return next < count ? Math.max(0, startOf(next) - last) : 0;
}

export function startsBelowCover(
  tops: readonly number[],
  covered: number,
): number[] {
  const starts: number[] = [];
  for (const top of tops) {
    starts.push(
      starts.length === 0 ? 0 : Math.max(starts.at(-1) ?? 0, top - covered),
    );
  }
  return starts;
}
