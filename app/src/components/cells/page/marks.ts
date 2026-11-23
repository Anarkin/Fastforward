import type { ColoredSegment } from '../../syntax/page/lineColors';
import { copiesIn } from '../../../lib/shared/textMatches';
import { wholeClusters } from './wholeClusters';

export interface FindMark {
  readonly start: number;
  readonly end: number;
  readonly current: boolean;
  readonly occurrence?: true;
}

export interface MarkedPiece extends ColoredSegment {
  readonly mark: 'match' | 'current' | 'occurrence' | undefined;
}

const keptCopies = 4000;

export function occurrencesOf(
  sought: string | undefined,
): (text: string) => readonly FindMark[] {
  const known = new Map<string, readonly FindMark[]>();
  return (text) => {
    const kept = known.get(text);
    if (kept !== undefined) {
      return kept;
    }
    if (known.size >= keptCopies) {
      known.clear();
    }
    const marks = occurrenceMarks(text, sought);
    known.set(text, marks);
    return marks;
  };
}

export function occurrenceMarks(
  text: string,
  sought: string | undefined,
): FindMark[] {
  return sought === undefined
    ? []
    : copiesIn(text, sought, false).map(({ start, end }) => ({
        start,
        end,
        current: false,
        occurrence: true,
      }));
}

export function markPieces(
  pieces: readonly ColoredSegment[],
  found: readonly FindMark[],
): MarkedPiece[] {
  const marks = wholeClusters(
    pieces.map((piece) => piece.text).join(''),
    found,
  );
  const cuts = new Set<number>();
  for (const mark of marks) {
    cuts.add(mark.start);
    cuts.add(mark.end);
  }
  const marked: MarkedPiece[] = [];
  let at = 0;
  for (const { text, kind, blank } of pieces) {
    const end = at + text.length;
    const edges = [
      at,
      ...[...cuts]
        .filter((cut) => cut > at && cut < end)
        .toSorted((a, b) => a - b),
      end,
    ];
    for (let index = 0; index + 1 < edges.length; index++) {
      const from = edges[index] ?? at;
      const to = edges[index + 1] ?? end;
      const mark = marks.find((each) => each.start <= from && from < each.end);
      marked.push({
        text: text.slice(from - at, to - at),
        kind,
        mark:
          mark === undefined
            ? undefined
            : mark.occurrence === true
              ? 'occurrence'
              : mark.current
                ? 'current'
                : 'match',
        ...(blank && { blank }),
      });
    }
    at = end;
  }
  return marked;
}
