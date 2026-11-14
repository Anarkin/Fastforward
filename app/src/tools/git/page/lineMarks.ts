import type { DiffFile, DiffLine, LoadedText } from './diff';
import { lineKey, type FindMatch, type FindRange } from './find';
import { matchMarks, minimapMarks, type MinimapMark } from './minimapMarks';
import type { SyntaxRange } from './syntax';
import type { WordRanges } from './wordDiff';
import { type TextWidths } from '../../../lib/page/textWidths';
import type { WholeFile, DiffRow } from './diffRows';
import { beyondAscii, minimapRows } from './rowMeasures';

export interface LineMarks {
  readonly syntax: ReadonlyMap<string, readonly SyntaxRange[]>;
  readonly words: WordRanges;
  readonly finds: ReadonlyMap<string, readonly FindRange[]>;
  readonly foundKey: string | undefined;
  readonly found: FindRange | undefined;
  readonly whitespace: boolean;
  readonly widths?: TextWidths;
}

export interface CodeProps {
  readonly text: string;
  readonly syntax: readonly SyntaxRange[];
  readonly words: readonly FindRange[];
  readonly wordClass: string;
  readonly finds: readonly FindRange[];
  readonly current: FindRange | undefined;
  readonly whitespace: boolean;
  readonly indent?: number;
  readonly widths?: TextWidths;
}

const unmarked: readonly never[] = [];

export function changedWords(
  words: WordRanges,
  key: string | undefined,
): readonly FindRange[] {
  const found = key === undefined ? undefined : words.get(key);
  return found === undefined || found === 'whole' ? unmarked : found;
}

export function wholeChangeClass(
  words: WordRanges,
  key: string | undefined,
): string {
  return key !== undefined && words.get(key) === 'whole' ? 'whole-change' : '';
}

export function codeProps(
  marks: LineMarks,
  key: string | undefined,
  text: string,
  kind: DiffLine['kind'] | undefined,
): CodeProps {
  const of = <T>(ranges: Pick<ReadonlyMap<string, readonly T[]>, 'get'>) =>
    (key !== undefined && ranges.get(key)) || unmarked;
  return {
    text,
    syntax: of(marks.syntax),
    words: changedWords(marks.words, key),
    wordClass: kind === 'removed' ? 'word-removed' : 'word-added',
    finds: of(marks.finds),
    current:
      key !== undefined && key === marks.foundKey ? marks.found : undefined,
    whitespace: marks.whitespace,
    widths: beyondAscii.test(text) ? marks.widths : undefined,
  };
}

export function findRangesByLine(
  matches: readonly FindMatch[],
): Map<string, FindRange[]> {
  const byLine = new Map<string, FindRange[]>();
  for (const match of matches) {
    const key = lineKey(match.file, match.line);
    const ranges = byLine.get(key);
    if (ranges) {
      ranges.push(match);
    } else {
      byLine.set(key, [match]);
    }
  }
  return byLine;
}

interface SyntaxInput {
  readonly files: readonly DiffFile[];
  readonly whole: WholeFile | undefined;
  readonly texts: ReadonlyMap<string, LoadedText>;
  readonly open: ReadonlySet<number>;
}

export const noSyntaxInput: SyntaxInput = {
  files: [],
  whole: undefined,
  texts: new Map(),
  open: new Set(),
};

interface MarksInput {
  readonly rows: readonly DiffRow[];
  readonly keys: readonly (readonly string[])[];
  readonly matched: ReadonlyMap<string, unknown>;
  readonly changeMarks: boolean;
  readonly measurements: readonly { readonly size: number }[];
}

export const noMarksInput: MarksInput = {
  rows: [],
  keys: [],
  matched: new Map(),
  changeMarks: false,
  measurements: [],
};

export function diffMinimapMarks(
  rows: readonly DiffRow[],
  keys: readonly (readonly string[])[],
  matchedLines: ReadonlyMap<string, unknown>,
  changeMarks: boolean,
  measured?: (index: number) => number | undefined,
): MinimapMark[] {
  const heights = minimapRows(rows, measured);
  const matched = new Set(
    keys.flatMap((row, index) =>
      row.some((key) => matchedLines.has(key)) ? [index] : [],
    ),
  );
  return [
    ...(changeMarks ? minimapMarks(heights) : []),
    ...matchMarks(heights, matched),
  ];
}
