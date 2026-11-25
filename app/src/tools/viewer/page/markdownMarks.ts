import { leastMark, tickJoiner } from '../../../lib/page/scrollbarTicks';

export interface MatchMark {
  readonly kind: 'match' | 'current';
  readonly top: number;
  readonly height: number;
}

export interface MatchSpan {
  readonly top: number;
  readonly height: number;
}

export function markdownMarks(
  spans: readonly MatchSpan[],
  total: number,
  viewport: number,
  current?: MatchSpan,
): MatchMark[] {
  if (total <= 0) {
    return [];
  }
  const joiner = tickJoiner(leastMark(total, viewport));
  for (const { top, height } of spans.toSorted(
    (one, other) => one.top - other.top,
  )) {
    joiner.add(top / total, (top + height) / total);
  }
  const marks: MatchMark[] = joiner
    .ticks()
    .map((tick) => ({ kind: 'match' as const, ...tick }));
  if (current !== undefined) {
    const least = leastMark(total, viewport);
    marks.push({
      kind: 'current',
      top: current.top / total,
      height: Math.max(current.height / total, least),
    });
  }
  return marks;
}
