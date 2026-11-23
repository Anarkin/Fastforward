import { invisibleParts } from './invisibles';

const segmenter = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
});

export interface Unit {
  readonly segment: string;
  readonly index: number;
}

function unitsOf(segment: string, index: number): Unit[] {
  const parts = invisibleParts(segment);
  if (parts === undefined) {
    return [{ segment, index }];
  }
  let at = index;
  return parts.map(({ text }) => {
    const unit = { segment: text, index: at };
    at += text.length;
    return unit;
  });
}

export class Units implements Iterable<Unit> {
  constructor(private readonly segments: Intl.Segments) {}

  containing(at: number): Unit | undefined {
    const found = this.segments.containing(at);
    return found === undefined
      ? undefined
      : unitsOf(found.segment, found.index).find(
          ({ segment, index }) => at < index + segment.length,
        );
  }

  *[Symbol.iterator](): Iterator<Unit> {
    for (const { segment, index } of this.segments) {
      yield* unitsOf(segment, index);
    }
  }
}

export const graphemes = {
  segment: (text: string): Units => new Units(segmenter.segment(text)),
};

const reach = 64;

export function clusterBreak(text: string, at: number, forward = true): number {
  if (forward ? at >= text.length : at <= 0) {
    return at;
  }
  const from = Math.max(0, at - reach);
  const code = text.charCodeAt(from);
  const start = from > 0 && code >= 0xdc00 && code <= 0xdfff ? from - 1 : from;
  const near = text.slice(start, at + reach);
  const unit = graphemes
    .segment(near)
    .containing(forward ? at - start : at - start - 1);
  if (unit === undefined) {
    return forward ? at + 1 : at - 1;
  }
  return forward
    ? start + unit.index + unit.segment.length
    : start + unit.index;
}

export const nonAscii = /[^\0-\x7f]/;
