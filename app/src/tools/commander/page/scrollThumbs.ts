import type { ByteRange } from '../shared/protocol';

export interface Thumb {
  readonly start: number;
  readonly length: number;
}

const minThumb = 24;

export interface RowText {
  readonly text: string;
  readonly from: number;
}

export function thumbBox(
  thumb: Thumb,
  track: number,
): { readonly top: number; readonly height: number } {
  const height = Math.min(track, Math.max(minThumb, thumb.length * track));
  return { top: thumb.start * (track - height), height };
}

export interface Tick {
  readonly top: number;
  readonly height: number;
}

export function matchTicks(
  matches: readonly ByteRange[],
  size: number,
  least: number,
): Tick[] {
  if (size <= 0) {
    return [];
  }
  const ticks: { top: number; bottom: number }[] = [];
  for (const match of matches) {
    const top = match.start / size;
    const bottom = Math.max(match.end / size, top + least);
    const last = ticks.at(-1);
    if (last !== undefined && top <= last.bottom) {
      last.bottom = Math.max(last.bottom, bottom);
    } else {
      ticks.push({ top, bottom });
    }
  }
  return ticks.map(({ top, bottom }) => ({ top, height: bottom - top }));
}
