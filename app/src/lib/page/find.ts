import type { DiffFile } from './diff';
import { maxMatches, matchesIn, type FindRange } from '../shared/textMatches';
import { sameSearchOptions, type SearchOptions } from '../shared/searchOptions';
import type { WholeFile } from './diffRows';
import { wholeLines } from './diffLines';

export type { FindRange };

export interface FindMatch extends FindRange {
  readonly file: number;
  readonly line: number;
}

function lineMatches(
  lines: readonly string[],
  file: number,
  query: string,
  options: SearchOptions,
): FindMatch[] {
  const matches: FindMatch[] = [];
  for (const [line, text] of lines.entries()) {
    for (const range of matchesIn(
      text,
      query,
      options,
      maxMatches - matches.length,
    )) {
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
  {
    readonly query: string;
    readonly options: SearchOptions;
    readonly matches: readonly FindMatch[];
  }
>();

function fileMatches(
  file: DiffFile,
  index: number,
  query: string,
  options: SearchOptions,
): readonly FindMatch[] {
  const cached = matchesOfFile.get(file);
  if (
    cached === undefined ||
    cached.query !== query ||
    !sameSearchOptions(cached.options, options)
  ) {
    const lines = file.hunks.flatMap((hunk) =>
      hunk.lines.map((line) => line.text),
    );
    const matches = lineMatches(lines, index, query, options);
    matchesOfFile.set(file, { query, options, matches });
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
  options: SearchOptions,
): FindMatch[] {
  if (query === '') {
    return [];
  }
  if (whole) {
    return whole.link ? [] : lineMatches(wholeLines(whole), 0, query, options);
  }
  const matches: FindMatch[] = [];
  for (const [index, file] of files.entries()) {
    for (const match of fileMatches(file, index, query, options)) {
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
