import { memo, Fragment } from 'react';
import type { DiffFile, DiffLine, LoadedText } from './diff';
import { lineKey, type FindMatch, type FindRange } from './find';
import {
  matchMarks,
  minimapMarks,
  type MinimapMark,
} from '../../../ui/minimap';
import type { SyntaxRange } from './syntax';
import type { WordRanges } from './wordDiff';
import { drawnText } from '../../../ui/blanks';
import { breakOffsets, leadLength } from '../../../ui/wordWrap';
import { wholeClusters, type TextWidths } from '../../../ui/textWidths';
import type { WholeFile, DiffRow } from './diffRows';
import { beyondAscii, minimapRows } from './rowMeasures';

function covering<T extends FindRange>(
  ranges: readonly T[],
): (start: number, end: number) => T | undefined {
  let next = 0;
  return (start, end) => {
    while (next < ranges.length && ranges[next].end <= start) {
      next++;
    }
    const range = ranges.at(next);
    return range && range.start <= start && end <= range.end
      ? range
      : undefined;
  };
}

function firstFrom(offsets: readonly number[], at: number): number {
  let low = 0;
  let high = offsets.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (offsets[middle] < at) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function breakable(
  text: string,
  indent: number | undefined,
  shown: (piece: string) => React.ReactNode,
): (piece: string, start: number) => React.ReactNode {
  if (indent === undefined) {
    return shown;
  }
  const lead = indent > 0 ? leadLength(text) : 0;
  const breaks = breakOffsets(text);
  return (piece, start) => {
    const end = start + piece.length;
    const parts: React.ReactNode[] = [];
    let at = start;
    if (at < lead) {
      at = Math.min(lead, end);
      parts.push(
        <span key="lead" className="lead">
          {shown(text.slice(start, at))}
        </span>,
      );
    }
    for (
      let index = firstFrom(breaks, at);
      index < breaks.length && breaks[index] < end;
      index++
    ) {
      const offset = breaks[index];
      if (offset > at) {
        parts.push(
          <Fragment key={at}>{shown(text.slice(at, offset))}</Fragment>,
        );
      }
      parts.push(<wbr key={`break:${offset}`} />);
      at = offset;
    }
    if (parts.length === 0) {
      return shown(piece);
    }
    if (at < end) {
      parts.push(<Fragment key={at}>{shown(text.slice(at, end))}</Fragment>);
    }
    return parts;
  };
}

export function marked(
  text: string,
  syntax: readonly SyntaxRange[],
  words: readonly FindRange[],
  wordClass: string,
  found: readonly FindRange[],
  foundNow: FindRange | undefined,
  whitespace = false,
  indent?: number,
  widths?: TextWidths,
): React.ReactNode {
  const shown = breakable(text, indent, drawnText(whitespace, widths));
  if (words.length === 0 && syntax.length === 0 && found.length === 0) {
    return shown(text, 0);
  }
  const finds = wholeClusters(text, found);
  const [current] =
    foundNow === undefined ? [] : wholeClusters(text, [foundNow]);
  const edges = [
    ...new Set([
      0,
      text.length,
      ...[...syntax, ...words, ...finds].flatMap((range) => [
        range.start,
        range.end,
      ]),
    ]),
  ].toSorted((a, b) => a - b);
  const findAt = covering(finds);
  const tokenAt = covering(syntax);
  const wordAt = covering(words);
  const gaps = new Set(
    words.flatMap((word) => (word.start === word.end ? [word.start] : [])),
  );
  const gap = (at: number) =>
    gaps.has(at) && <span className={`word-gap ${wordClass}`} />;
  const pieces = edges.slice(0, -1).map((start, index) => {
    const end = edges[index + 1];
    const piece = text.slice(start, end);
    const find = findAt(start, end);
    const isCurrent =
      find !== undefined &&
      current?.start === find.start &&
      current.end === find.end;
    let content: React.ReactNode = find ? (
      <mark className={`find-match ${isCurrent ? 'current' : ''}`}>
        {shown(piece, start)}
      </mark>
    ) : (
      shown(piece, start)
    );
    const token = tokenAt(start, end);
    if (token) {
      content = <span className={`syntax-${token.kind}`}>{content}</span>;
    }
    return (
      <Fragment key={start}>
        {gap(start)}
        {wordAt(start, end) ? (
          <span className={wordClass}>{content}</span>
        ) : (
          content
        )}
      </Fragment>
    );
  });
  return gaps.has(text.length) ? (
    <>
      {pieces}
      {gap(text.length)}
    </>
  ) : (
    pieces
  );
}

export interface LineMarks {
  readonly syntax: ReadonlyMap<string, readonly SyntaxRange[]>;
  readonly words: WordRanges;
  readonly finds: ReadonlyMap<string, readonly FindRange[]>;
  readonly foundKey: string | undefined;
  readonly found: FindRange | undefined;
  readonly whitespace: boolean;
  readonly widths?: TextWidths;
}

interface CodeProps {
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
  const of = <T,>(ranges: Pick<ReadonlyMap<string, readonly T[]>, 'get'>) =>
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

export const Code = memo(function Code({
  text,
  syntax,
  words,
  wordClass,
  finds,
  current,
  whitespace,
  indent,
  widths,
}: CodeProps) {
  return (
    <span
      className="code"
      style={
        indent
          ? { '--wrap-indent': `calc(${indent} * var(--diff-advance))` }
          : undefined
      }
    >
      {marked(
        text,
        syntax,
        words,
        wordClass,
        finds,
        current,
        whitespace,
        indent,
        widths,
      )}
    </span>
  );
});

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
