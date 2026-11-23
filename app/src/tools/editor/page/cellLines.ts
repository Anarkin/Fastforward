import type { Line, Text } from '@codemirror/state';
import type {
  SegmentsOf,
  ShownRows,
} from '../../../components/cells/page/cellPainting';
import type { ScreenRow, TextLine } from '../../../components/cells/page/lines';
import type { FindMark } from '../../../components/cells/page/marks';
import {
  segmentsOfLine,
  type ColoredRange,
  type ColoredSegment,
} from '../../../components/syntax/page/lineColors';

export interface DocMark {
  readonly from: number;
  readonly to: number;
  readonly current?: boolean;
  readonly occurrence?: true;
}

export interface DocRange {
  readonly anchor: number;
  readonly head: number;
}

export interface LinesShown {
  readonly showWhitespace: boolean;
  readonly colorsOf: (line: number) => readonly ColoredRange[] | undefined;
  readonly endingOf: (line: Line) => string | undefined;
  readonly marks: readonly DocMark[];
  readonly selected: readonly DocRange[];
  readonly stamp: readonly unknown[];
}

const unmarked: readonly FindMark[] = [];

function firstEndingAfter(marks: readonly DocMark[], from: number): number {
  let low = 0;
  let high = marks.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((marks[middle]?.to ?? 0) <= from) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

export function marksOfLine(
  marks: readonly DocMark[],
  from: number,
  to: number,
): readonly FindMark[] {
  let found: FindMark[] | undefined;
  for (let at = firstEndingAfter(marks, from); at < marks.length; at++) {
    const mark = marks[at];
    if (mark === undefined || mark.from >= to) {
      break;
    }
    (found ??= []).push({
      start: Math.max(mark.from, from) - from,
      end: Math.min(mark.to, to) - from,
      current: mark.current === true,
      ...(mark.occurrence === true && { occurrence: true as const }),
    });
  }
  return found ?? unmarked;
}

export type LinesMarked = Pick<ShownRows, 'segmentsOf' | 'marksOf'>;

export function selectionsOf(
  selected: readonly DocRange[],
  doc: Text,
): NonNullable<ShownRows['selections']> {
  const placeOf = (pos: number) => {
    const line = doc.lineAt(pos);
    return { start: line.number, char: pos - line.from };
  };
  return selected
    .filter(({ anchor, head }) => anchor !== head)
    .map(({ anchor, head }) => ({
      anchor: placeOf(anchor),
      focus: placeOf(head),
    }));
}

export function linesMarked(
  { colorsOf, marks }: Pick<LinesShown, 'colorsOf' | 'marks'>,
  doc: Text,
): LinesMarked {
  const segments = new WeakMap<
    TextLine,
    readonly ColoredSegment[] | undefined
  >();
  const marked = new WeakMap<TextLine, readonly FindMark[]>();
  const segmentsOf: SegmentsOf = (line) => {
    if (!segments.has(line)) {
      const ranges = colorsOf(line.start);
      segments.set(
        line,
        ranges === undefined || ranges.length === 0
          ? undefined
          : segmentsOfLine(line.text, ranges),
      );
    }
    return segments.get(line);
  };
  const marksOf = ({ row }: ScreenRow) => {
    let found = marked.get(row);
    if (found === undefined) {
      const { from } = doc.line(row.start);
      found =
        marks.length === 0
          ? unmarked
          : marksOfLine(marks, from, from + row.text.length);
      marked.set(row, found);
    }
    return found;
  };
  return { segmentsOf, marksOf };
}
