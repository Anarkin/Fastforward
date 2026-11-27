export const leastTick = 2;

export interface Tick {
  readonly top: number;
  readonly height: number;
}

export interface TickJoiner {
  readonly add: (top: number, bottom: number) => void;
  readonly ticks: () => Tick[];
}

const touching = 1e-9;

export function tickJoiner(least: number): TickJoiner {
  const spans: { top: number; bottom: number }[] = [];
  return {
    add: (top, bottom) => {
      const reached = Math.max(bottom, top + least);
      const last = spans.at(-1);
      if (last !== undefined && top <= last.bottom + touching) {
        last.bottom = Math.max(last.bottom, reached);
      } else {
        spans.push({ top, bottom: reached });
      }
    },
    ticks: () =>
      spans.map(({ top, bottom }) => ({ top, height: bottom - top })),
  };
}

export function leastMark(total: number, viewport: number): number {
  const marked = Math.min(total, viewport);
  return marked > 0 ? leastTick / marked : 0;
}

export function marksScale(total: number, viewport: number): number {
  return total > 0 && total < viewport ? total / viewport : 1;
}

export interface Span {
  readonly top: number;
  readonly bottom: number;
}

export interface MatchMark extends Tick {
  readonly kind: 'match' | 'current';
}

export function leastOn(track: number): number {
  return track > 0 ? leastTick / track : 0;
}

export function spanTicks(
  spans: Iterable<Span>,
  total: number,
  least: number,
): Tick[] {
  if (total <= 0) {
    return [];
  }
  const joiner = tickJoiner(least);
  for (const { top, bottom } of spans) {
    joiner.add(top / total, bottom / total);
  }
  return joiner.ticks();
}

export function spanTick(
  span: Span | undefined,
  total: number,
  least: number,
): Tick | undefined {
  return span === undefined || total <= 0
    ? undefined
    : {
        top: span.top / total,
        height: Math.max((span.bottom - span.top) / total, least),
      };
}

export function matchMarks(
  spans: Iterable<Span>,
  current: Span | undefined,
  total: number,
  least: number,
): MatchMark[] {
  const shown = spanTick(current, total, least);
  return [
    ...spanTicks(spans, total, least).map((tick) => ({
      kind: 'match' as const,
      ...tick,
    })),
    ...(shown === undefined ? [] : [{ kind: 'current' as const, ...shown }]),
  ];
}
