import { strings } from './strings';
import type { SearchOptions } from './searchOptions';

export interface FindRange {
  readonly start: number;
  readonly end: number;
}

export const maxMatches = 10_000;

const wordCharacter = '[\\p{L}\\p{M}\\p{N}_]';
const wordBefore = new RegExp(`${wordCharacter}$`, 'u');
const wordAfter = new RegExp(`^${wordCharacter}`, 'u');
const wordRun = new RegExp(`${wordCharacter}+`, 'gu');

const blank = /^\s+$/u;

export type CharacterKind = 'word' | 'space' | 'other';

export const characterKind = (cluster: string): CharacterKind =>
  blank.test(cluster) ? 'space' : wordAfter.test(cluster) ? 'word' : 'other';

let compiled:
  | {
      readonly query: string;
      readonly caseSensitive: boolean;
      readonly wholeWord: boolean;
      readonly pattern: RegExp | undefined;
    }
  | undefined;

export function searchPattern(
  query: string,
  options: SearchOptions,
): RegExp | undefined {
  if (!options.regex || query === '') {
    return undefined;
  }
  const { caseSensitive, wholeWord } = options;
  if (
    compiled?.query !== query ||
    compiled.caseSensitive !== caseSensitive ||
    compiled.wholeWord !== wholeWord
  ) {
    const source = wholeWord
      ? `(?<!${wordCharacter})(?:${query})(?!${wordCharacter})`
      : query;
    let pattern: RegExp | undefined;
    try {
      pattern = new RegExp(source, `gmu${caseSensitive ? '' : 'i'}`);
    } catch {
      pattern = undefined;
    }
    compiled = { query, caseSensitive, wholeWord, pattern };
  }
  return compiled.pattern;
}

export function validSearch(query: string, options: SearchOptions): boolean {
  return !options.regex || query === '' || !!searchPattern(query, options);
}

export function matchesIn(
  text: string,
  query: string,
  options: SearchOptions,
  limit = Infinity,
): FindRange[] {
  if (query === '' || limit <= 0) {
    return [];
  }
  return options.regex
    ? patternMatches(text, query, options, limit)
    : plainMatches(text, query, options, limit);
}

function patternMatches(
  text: string,
  query: string,
  options: SearchOptions,
  limit: number,
): FindRange[] {
  const pattern = searchPattern(query, options);
  const ranges: FindRange[] = [];
  if (pattern === undefined) {
    return ranges;
  }
  pattern.lastIndex = 0;
  for (
    let match = pattern.exec(text);
    match !== null && ranges.length < limit;
    match = pattern.exec(text)
  ) {
    if (match[0] === '') {
      pattern.lastIndex =
        match.index + ((text.codePointAt(match.index) ?? 0) > 0xffff ? 2 : 1);
    } else {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  return ranges;
}

export const longestCopy = 200;

const blankOnly = /^\s*$/u;

export function soughtCopy(selected: string): string | undefined {
  const sought = blankOnly.test(selected) ? selected : selected.trim();
  return sought === '' || sought.length > longestCopy || sought.includes('\n')
    ? undefined
    : sought;
}

export function copiesIn(
  text: string,
  copy: string,
  wholeWord: boolean,
  limit = Infinity,
): FindRange[] {
  return copy === '' || limit <= 0
    ? []
    : plainMatches(
        text,
        copy,
        { caseSensitive: true, wholeWord, regex: false },
        limit,
      );
}

export function wordAround(text: string, at: number): FindRange | undefined {
  for (const run of text.matchAll(wordRun)) {
    if (run.index > at) {
      return undefined;
    }
    const end = run.index + run[0].length;
    if (end >= at) {
      return { start: run.index, end };
    }
  }
  return undefined;
}

export function standsAlone(text: string, start: number, end: number): boolean {
  return (
    !wordBefore.test(text.slice(Math.max(0, start - 2), start)) &&
    !wordAfter.test(text.slice(end, end + 2))
  );
}

function plainMatches(
  text: string,
  query: string,
  { caseSensitive, wholeWord }: SearchOptions,
  limit: number,
): FindRange[] {
  const fold = caseSensitive ? decomposed : folded;
  const needle = fold(query);
  const whole = fold(text);
  const map =
    whole.length === text.length ? undefined : foldedPlaces(text, fold);
  const searched = map?.folded ?? whole;
  const ranges: FindRange[] = [];
  let from = searched.indexOf(needle);
  while (from !== -1 && ranges.length < limit) {
    const end = from + needle.length;
    if (wholeWord && !standsAlone(searched, from, end)) {
      from = searched.indexOf(needle, from + 1);
      continue;
    }
    ranges.push(
      map === undefined
        ? { start: from, end }
        : { start: map.starts[from], end: map.ends[end - 1] },
    );
    from = searched.indexOf(needle, end);
  }
  return ranges;
}

export function folded(text: string): string {
  return text.toLowerCase().replaceAll('ς', 'σ').normalize('NFD');
}

function decomposed(text: string): string {
  return text.normalize('NFD');
}

function foldedPlaces(
  text: string,
  fold: (text: string) => string,
): {
  folded: string;
  starts: number[];
  ends: number[];
} {
  let all = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let index = 0;
  for (const character of text) {
    const each = fold(character);
    for (let unit = 0; unit < each.length; unit++) {
      starts.push(index);
      ends.push(index + character.length);
    }
    all += each;
    index += character.length;
  }
  return { folded: all, starts, ends };
}

export interface MatchesFound {
  readonly current: number;
  readonly matches: number;
  readonly capped?: boolean;
  readonly searching?: boolean;
}

export function matchCount(
  query: string,
  options: SearchOptions,
  { current, matches, capped = matches >= maxMatches, searching }: MatchesFound,
): string {
  if (query === '') {
    return '';
  }
  if (!validSearch(query, options)) {
    return strings.find.badPattern;
  }
  if (matches === 0) {
    return searching === true ? strings.find.searching : strings.find.noResults;
  }
  return strings.find.count(current + 1, matches, capped);
}

export function firstNotBefore<Match>(
  matches: readonly Match[],
  before: (match: Match) => boolean,
): number {
  const at = matches.findIndex((match) => !before(match));
  return at === -1 ? 0 : at;
}

export function stepMatch(
  current: number,
  matches: number,
  step: 1 | -1,
): number {
  return matches === 0 ? 0 : (current + step + matches) % matches;
}
