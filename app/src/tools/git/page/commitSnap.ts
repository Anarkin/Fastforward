const onStart = 0.01;

function firstStartFrom(
  startOf: (index: number) => number,
  count: number,
  top: number,
): number {
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (startOf(middle) < top - onStart) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

export function snappedToCommit(
  startOf: (index: number) => number,
  count: number,
  top: number,
  toward: number,
  max: number,
): number {
  if (count === 0) {
    return Math.max(0, Math.min(max, top));
  }
  const next = firstStartFrom(startOf, count, top);
  const onIt = next < count && Math.abs(startOf(next) - top) <= onStart;
  const index =
    toward < 0 && !onIt ? Math.max(0, next - 1) : Math.min(count - 1, next);
  return Math.max(0, Math.min(max, startOf(index)));
}

export function commitEndPadding(
  startOf: (index: number) => number,
  count: number,
  contentEnd: number,
  room: number,
): number {
  const last = contentEnd - room;
  if (last <= 0 || count === 0) {
    return 0;
  }
  const next = firstStartFrom(startOf, count, last);
  return next < count ? Math.max(0, startOf(next) - last) : 0;
}
