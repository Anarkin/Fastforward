import { folded, matchesIn, type FindRange } from './textMatches';

export function filterWords(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean);
}

export function matchesFilter(
  words: readonly string[],
  ...texts: readonly (string | undefined)[]
): boolean {
  return words.every((word) =>
    texts.some(
      (text) => text !== undefined && matchesIn(text, word, 1).length > 0,
    ),
  );
}

export function foldedForFilter(text: string): string {
  return folded(text);
}

export function filterNeedles(words: readonly string[]): string[] {
  return words.map(folded);
}

export function matchesNeedles(
  needles: readonly string[],
  ...foldedTexts: readonly string[]
): boolean {
  return needles.every((needle) =>
    foldedTexts.some((text) => text.includes(needle)),
  );
}

export function filterRanges(
  text: string,
  words: readonly string[],
): FindRange[] {
  const ranges = words
    .flatMap((word) => matchesIn(text, word))
    .toSorted((a, b) => a.start - b.start);
  const joined: FindRange[] = [];
  for (const range of ranges) {
    const last = joined.at(-1);
    if (last && range.start <= last.end) {
      joined[joined.length - 1] = {
        start: last.start,
        end: Math.max(last.end, range.end),
      };
    } else {
      joined.push(range);
    }
  }
  return joined;
}
