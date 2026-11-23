export interface ColoredRange {
  readonly start: number;
  readonly end: number;
  readonly kind: string;
}

export interface ColoredSegment {
  readonly text: string;
  readonly kind?: string | undefined;
}

const plain = 'plain';

const drawn = /[^ \t\r\n]/;

function commonOf<Kind extends string>(
  counts: ReadonlyMap<Kind, number>,
  plainOnes: number,
): Kind | undefined {
  let common: Kind | undefined;
  let most = plainOnes;
  for (const [kind, count] of counts) {
    if (count > most) {
      common = kind;
      most = count;
    }
  }
  return common;
}

export function lineColors<Kind extends string>(
  text: string,
  tokens: readonly (ColoredRange & { readonly kind: Kind })[],
): {
  readonly common: Kind | undefined;
  readonly others: readonly ColoredRange[];
} {
  const gaps: ColoredRange[] = [];
  const counts = new Map<Kind, number>();
  let at = 0;
  const gap = (end: number) => {
    if (end > at && drawn.test(text.slice(at, end))) {
      gaps.push({ start: at, end, kind: plain });
    }
  };
  for (const token of tokens) {
    gap(token.start);
    counts.set(token.kind, (counts.get(token.kind) ?? 0) + 1);
    at = token.end;
  }
  gap(text.length);
  const common = commonOf(counts, gaps.length);
  return common === undefined
    ? { common, others: tokens }
    : {
        common,
        others: [
          ...tokens.filter(({ kind }) => kind !== common),
          ...gaps,
        ].toSorted((one, other) => one.start - other.start),
      };
}

export function segmentColors(segments: readonly ColoredSegment[]): {
  readonly common: string | undefined;
  readonly others: readonly ColoredSegment[];
} {
  const counts = new Map<string, number>();
  let plainOnes = 0;
  for (const { text, kind } of segments) {
    if (kind !== undefined) {
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    } else if (drawn.test(text)) {
      plainOnes++;
    }
  }
  const common = commonOf(counts, plainOnes);
  if (common === undefined) {
    return { common, others: segments };
  }
  const others: ColoredSegment[] = [];
  for (const { text, kind } of segments) {
    const last = others.at(-1);
    if (kind !== undefined && kind !== common) {
      others.push({ text, kind });
    } else if (kind === undefined && drawn.test(text)) {
      others.push({ text, kind: plain });
    } else if (last !== undefined && last.kind === undefined) {
      others[others.length - 1] = { text: last.text + text };
    } else {
      others.push({ text });
    }
  }
  return { common, others };
}

export function segmentsOfLine(
  text: string,
  ranges: readonly ColoredRange[],
): ColoredSegment[] {
  const segments: ColoredSegment[] = [];
  let at = 0;
  for (const { start, end, kind } of ranges) {
    if (start > at) {
      segments.push({ text: text.slice(at, start) });
    }
    segments.push({ text: text.slice(start, end), kind });
    at = end;
  }
  if (at < text.length) {
    segments.push({ text: text.slice(at) });
  }
  return segments;
}
