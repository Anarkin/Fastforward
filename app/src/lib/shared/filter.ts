import { plainSearch, type SearchOptions } from './searchOptions';
import { folded, matchesIn, type FindRange } from './textMatches';

export interface Filter {
  readonly words: readonly string[];
  readonly options: SearchOptions;
}

export const noFilter: Filter = { words: [], options: plainSearch };

export function searchFilter(query: string, options: SearchOptions): Filter {
  const words = options.regex
    ? query === ''
      ? []
      : [query]
    : query.trim().split(/\s+/).filter(Boolean);
  return { words, options };
}

export function narrows(filter: Filter): boolean {
  return filter.words.length > 0;
}

export function matchesFilter(
  { words, options }: Filter,
  ...texts: readonly (string | undefined)[]
): boolean {
  return words.every((word) =>
    texts.some(
      (text) =>
        text !== undefined && matchesIn(text, word, options, 1).length > 0,
    ),
  );
}

export function foldedForFilter(text: string): string {
  return folded(text);
}

export interface FilterText {
  readonly text: string;
  readonly folded: string;
}

export function filterText(text: string): FilterText {
  return { text, folded: folded(text) };
}

export interface Needles {
  readonly filter: Filter;
  readonly folded: readonly string[] | undefined;
}

export function filterNeedles(filter: Filter): Needles {
  const { caseSensitive, wholeWord, regex } = filter.options;
  return {
    filter,
    folded:
      caseSensitive || wholeWord || regex
        ? undefined
        : filter.words.map(folded),
  };
}

export function matchesNeedles(
  { filter, folded: needles }: Needles,
  ...texts: readonly FilterText[]
): boolean {
  return needles === undefined
    ? matchesFilter(filter, ...texts.map(({ text }) => text))
    : needles.every((needle) =>
        texts.some(({ folded: text }) => text.includes(needle)),
      );
}

export function filterRanges(text: string, filter: Filter): FindRange[] {
  const ranges = filter.words
    .flatMap((word) => matchesIn(text, word, filter.options))
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
