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
