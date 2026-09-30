import type { DiffFile } from './diff';
import type { WholeFile } from './diffView';

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

export function matchesIn(text: string, query: string): FindRange[] {
  if (query === '') {
    return [];
  }
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  const ranges: FindRange[] = [];
  let from = haystack.indexOf(needle);
  while (from !== -1) {
    const end = from + needle.length;
    ranges.push({ start: from, end });
    from = haystack.indexOf(needle, end);
  }
  return ranges;
}

function searchedLines(
  files: readonly DiffFile[],
  whole: WholeFile | undefined,
): string[][] {
  if (whole) {
    return [wholeLines(whole)];
  }
  return files.map((file) =>
    file.hunks.flatMap((hunk) => hunk.lines.map((line) => line.text)),
  );
}

export function findMatches(
  files: readonly DiffFile[],
  whole: WholeFile | undefined,
  query: string,
): FindMatch[] {
  if (query === '') {
    return [];
  }
  return searchedLines(files, whole).flatMap((lines, file) =>
    lines.flatMap((text, line) =>
      matchesIn(text, query).map((range) => ({
        file,
        line,
        ...range,
      })),
    ),
  );
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
  return matches === 0 ? 'No results' : `${current + 1} of ${matches}`;
}

export function stepMatch(
  current: number,
  matches: number,
  step: 1 | -1,
): number {
  return matches === 0 ? 0 : (current + step + matches) % matches;
}
