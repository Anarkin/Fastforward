import { graphemes, nonAscii } from './graphemes';

interface Range {
  readonly start: number;
  readonly end: number;
}

export function wholeClusters<T extends Range>(
  text: string,
  ranges: readonly T[],
): readonly T[] {
  if (ranges.length === 0 || !nonAscii.test(text)) {
    return ranges;
  }
  const clusters = graphemes.segment(text);
  const startOf = (at: number) =>
    at < text.length ? (clusters.containing(at)?.index ?? at) : at;
  const endOf = (at: number) => {
    const cluster = at < text.length ? clusters.containing(at) : undefined;
    return cluster === undefined || cluster.index === at
      ? at
      : cluster.index + cluster.segment.length;
  };
  return ranges.map((range) => {
    const start = startOf(range.start);
    const end = endOf(range.end);
    return start === range.start && end === range.end
      ? range
      : { ...range, start, end };
  });
}
