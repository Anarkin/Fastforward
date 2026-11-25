import { tickJoiner, type Tick } from '../../../lib/page/scrollbarTicks';
import type { ByteRange } from '../shared/protocol';

export interface Thumb {
  readonly start: number;
  readonly length: number;
}

export interface Ends {
  readonly atStart: boolean;
  readonly atEnd: boolean;
}

export function rowEnds(top: number, lastTop: number): Ends {
  return { atStart: top <= 0, atEnd: top >= lastTop };
}

export function matchTicks(
  matches: readonly ByteRange[],
  size: number,
  least: number,
): Tick[] {
  if (size <= 0) {
    return [];
  }
  const joined = tickJoiner(least);
  for (const match of matches) {
    joined.add(match.start / size, match.end / size);
  }
  return joined.ticks();
}

export function currentTick(
  match: ByteRange | undefined,
  size: number,
  least: number,
): Tick | undefined {
  return match === undefined || size <= 0
    ? undefined
    : {
        top: match.start / size,
        height: Math.max((match.end - match.start) / size, least),
      };
}
