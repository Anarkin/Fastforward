export type FilterMove = 'up' | 'down' | 'pageUp' | 'pageDown';

export function filterStep(
  move: FilterMove,
  from: number,
  count: number,
  page: number,
): number {
  const by =
    move === 'up' ? -1 : move === 'down' ? 1 : move === 'pageUp' ? -page : page;
  return Math.max(0, Math.min(count - 1, from + by));
}
