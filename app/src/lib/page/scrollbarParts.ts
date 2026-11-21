export const shortestThumb = 24;

export interface Scrolled {
  readonly scrollSize: number;
  readonly clientSize: number;
  readonly scrolled: number;
}

interface Extent {
  readonly from: number;
  readonly length: number;
}

export interface Parts {
  readonly start: Extent;
  readonly track: Extent;
  readonly thumb: Extent | undefined;
  readonly end: Extent;
}

export type Part = 'start' | 'before' | 'thumb' | 'after' | 'end';

const rangeOf = ({ scrollSize, clientSize }: Scrolled) =>
  Math.max(0, scrollSize - clientSize);

function thumbIn(
  track: Extent,
  scrolled: Scrolled,
  scale: number,
): Extent | undefined {
  const range = rangeOf(scrolled);
  const room = Math.round(track.length * scale);
  const least = Math.round(shortestThumb * scale);
  if (range < 1 || room < least) {
    return undefined;
  }
  const length = Math.min(
    room,
    Math.max(
      least,
      Math.round((room * scrolled.clientSize) / scrolled.scrollSize),
    ),
  );
  const at =
    range - scrolled.scrolled <= 0.5
      ? range
      : Math.max(0, Math.min(range, scrolled.scrolled));
  const along = Math.fround(Math.fround(at * (room - length)) / range);
  const cut = along > 0 && along < 1 ? 1 : Math.trunc(along);
  return { from: track.from + cut / scale, length: length / scale };
}

export function partsOf(
  bar: number,
  size: number,
  scrolled: Scrolled,
  scale = 1,
): Parts {
  const button = Math.min(size, bar / 2);
  const track = { from: button, length: Math.max(0, bar - 2 * button) };
  return {
    start: { from: 0, length: button },
    track,
    thumb: thumbIn(track, scrolled, scale),
    end: { from: bar - button, length: button },
  };
}

export function partAt({ start, thumb, end }: Parts, along: number): Part {
  if (along < start.length) {
    return 'start';
  }
  if (along >= end.from) {
    return 'end';
  }
  if (thumb === undefined || along < thumb.from) {
    return 'before';
  }
  return along < thumb.from + thumb.length ? 'thumb' : 'after';
}

function scrollAPixel({ track, thumb }: Parts, scrolled: Scrolled): number {
  const room = thumb === undefined ? 0 : track.length - thumb.length;
  return room > 0 ? rangeOf(scrolled) / room : 0;
}

export function jumpedTo(
  parts: Parts,
  scrolled: Scrolled,
  along: number,
): number {
  const { track, thumb } = parts;
  if (thumb === undefined) {
    return 0;
  }
  const from = along - track.from - thumb.length / 2;
  return Math.max(
    0,
    Math.min(
      rangeOf(scrolled),
      Math.round(from * scrollAPixel(parts, scrolled)),
    ),
  );
}

export function draggedFrom(
  parts: Parts,
  scrolled: Scrolled,
  along: number,
): (now: number) => number {
  const ratio = scrollAPixel(parts, scrolled);
  return (now) => scrolled.scrolled + (now - along) * ratio;
}
