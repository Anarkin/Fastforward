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
