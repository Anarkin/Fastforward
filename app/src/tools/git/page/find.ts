import type { DiffFile } from './diff';
import {
  maxMatches,
  matchesIn,
  type FindRange,
} from '../../../lib/shared/textMatches';
import type { WholeFile } from './diffRows';

export type { FindRange };

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
): FindMatch[] {
  if (query === '') {
    return [];
  }
  if (whole) {
    return whole.link ? [] : lineMatches(wholeLines(whole), 0, query);
  }
  const matches: FindMatch[] = [];
  for (const [index, file] of files.entries()) {
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
