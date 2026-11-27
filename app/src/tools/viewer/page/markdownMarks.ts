import {
  leastMark,
  matchMarks,
  type MatchMark,
} from '../../../lib/page/scrollbarTicks';

export interface MatchSpan {
  readonly top: number;
  readonly height: number;
}

const spanOf = ({ top, height }: MatchSpan) => ({ top, bottom: top + height });

export function markdownMarks(
  spans: readonly MatchSpan[],
  total: number,
  viewport: number,
  current?: MatchSpan,
): MatchMark[] {
  return matchMarks(
    spans.toSorted((one, other) => one.top - other.top).map(spanOf),
    current === undefined ? undefined : spanOf(current),
    total,
    leastMark(total, viewport),
  );
}
