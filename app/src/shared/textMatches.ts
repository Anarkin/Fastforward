import { strings } from './strings';

export interface FindRange {
  readonly start: number;
  readonly end: number;
}

export const maxMatches = 10_000;

export function matchesIn(
  text: string,
  query: string,
  limit = Infinity,
): FindRange[] {
  if (query === '') {
    return [];
  }
  const needle = folded(query);
  const whole = folded(text);
  const ranges: FindRange[] = [];
  if (whole.length === text.length) {
    let from = whole.indexOf(needle);
    while (from !== -1 && ranges.length < limit) {
      const end = from + needle.length;
      ranges.push({ start: from, end });
      from = whole.indexOf(needle, end);
    }
    return ranges;
  }
  const { lowered, starts, ends } = lowercased(text);
  let from = lowered.indexOf(needle);
  while (from !== -1 && ranges.length < limit) {
    const end = from + needle.length;
    ranges.push({ start: starts[from], end: ends[end - 1] });
    from = lowered.indexOf(needle, end);
  }
  return ranges;
}

function folded(text: string): string {
  return text.toLowerCase().replaceAll('ς', 'σ').normalize('NFD');
}

function lowercased(text: string): {
  lowered: string;
  starts: number[];
  ends: number[];
} {
  let lowered = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let index = 0;
  for (const character of text) {
    const lower = folded(character);
    for (let unit = 0; unit < lower.length; unit++) {
      starts.push(index);
      ends.push(index + character.length);
    }
    lowered += lower;
    index += character.length;
  }
  return { lowered, starts, ends };
}

export function matchCount(
  query: string,
  matches: number,
  current: number,
): string {
  if (query === '') {
    return '';
  }
  if (matches === 0) {
    return strings.find.noResults;
  }
  return strings.find.count(current + 1, matches, matches >= maxMatches);
}

export function stepMatch(
  current: number,
  matches: number,
  step: 1 | -1,
): number {
  return matches === 0 ? 0 : (current + step + matches) % matches;
}
