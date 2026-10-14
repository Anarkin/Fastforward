import { matchesIn, type FindRange } from './find';

export function filterWords(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean);
}

export function matchesFilter(
  words: readonly string[],
  path: string,
  oldPath?: string,
): boolean {
  return words.every(
    (word) =>
      matchesIn(path, word, 1).length > 0 ||
      (oldPath !== undefined && matchesIn(oldPath, word, 1).length > 0),
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
