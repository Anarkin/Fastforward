import type { DiffFile } from './diff';
import type { WholeFile } from './diffView';
import { previewOf, wholePreviewOf } from './previews';
import { strings } from '../shared/strings';

export interface FindRange {
  readonly start: number;
  readonly end: number;
}

export interface FindMatch extends FindRange {
  readonly file: number;
  readonly line: number;
}

export function wholeLines(whole: WholeFile): string[] {
  return whole.binary || whole.content === ''
    ? []
    : whole.content.replace(/\n$/, '').split('\n');
}

export function lineKey(file: number, line: number): string {
  return `${file}:${line}`;
}

export function keyedLine(key: string): readonly [number, number] {
  const colon = key.indexOf(':');
  return [Number(key.slice(0, colon)), Number(key.slice(colon + 1))];
}

const maxMatches = 10_000;

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
  return text.toLowerCase().replaceAll('ς', 'σ');
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

function lineMatches(
  lines: readonly string[],
  file: number,
  query: string,
): FindMatch[] {
  const matches: FindMatch[] = [];
  for (const [line, text] of lines.entries()) {
    for (const range of matchesIn(text, query, maxMatches - matches.length)) {
      matches.push({ file, line, ...range });
    }
    if (matches.length === maxMatches) {
      break;
    }
  }
  return matches;
}

const matchesOfFile = new WeakMap<
  DiffFile,
  { readonly query: string; readonly matches: readonly FindMatch[] }
>();

function fileMatches(
  file: DiffFile,
  index: number,
  query: string,
): readonly FindMatch[] {
  const cached = matchesOfFile.get(file);
  if (cached?.query !== query) {
    const lines = file.hunks.flatMap((hunk) =>
      hunk.lines.map((line) => line.text),
    );
    const matches = lineMatches(lines, index, query);
    matchesOfFile.set(file, { query, matches });
    return matches;
  }
  return cached.matches[0]?.file === index
    ? cached.matches
    : cached.matches.map((match) => ({ ...match, file: index }));
}

export function findMatches(
  files: readonly DiffFile[],
  whole: WholeFile | undefined,
  query: string,
  previewed: ReadonlySet<string> = new Set(),
): FindMatch[] {
  if (query === '') {
    return [];
  }
  if (whole) {
    return wholePreviewOf(whole) && previewed.has(whole.path)
      ? []
      : lineMatches(wholeLines(whole), 0, query);
  }
  const matches: FindMatch[] = [];
  for (const [index, file] of files.entries()) {
    if (previewOf(file) && previewed.has(file.path)) {
      continue;
    }
    for (const match of fileMatches(file, index, query)) {
      if (matches.length === maxMatches) {
        return matches;
      }
      matches.push(match);
    }
  }
  return matches;
}

export function unsearchedFiles(
  files: readonly DiffFile[],
  whole: WholeFile | undefined,
): number {
  return whole ? 0 : files.filter((file) => file.placeholder).length;
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

export function jumpStep(
  found: boolean,
  loading: boolean,
  fileOpen: boolean,
): 'wait' | 'done' | 'open' | 'scroll' {
  if (!found) {
    return loading ? 'wait' : 'done';
  }
  return fileOpen ? 'scroll' : 'open';
}

export function stepMatch(
  current: number,
  matches: number,
  step: 1 | -1,
): number {
  return matches === 0 ? 0 : (current + step + matches) % matches;
}
