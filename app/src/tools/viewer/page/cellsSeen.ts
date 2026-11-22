import { rowKey, type ShownRows } from './cellPainting';
import type { FindMark } from './markPieces';
import { marksWithin, piecesWithin } from './screenRows';
import { rowSegments } from './textColors';
import { selectedIn, type CharRange } from './textSelection';

interface SeenMark {
  readonly from: number;
  readonly to: number;
  readonly name: 'match' | 'current' | 'occurrence';
}

export interface SeenRow {
  readonly key: string;
  readonly text: string;
  readonly column: number;
  readonly kinds: readonly string[];
  readonly marks: readonly SeenMark[];
  readonly selected: CharRange | undefined;
  readonly breakAt: number | undefined;
  readonly continues: boolean;
}

declare global {
  interface HTMLElement {
    seenRows?: (() => readonly SeenRow[]) | undefined;
  }
}

const plain = 'plain';

const nameOf = ({ current, occurrence }: FindMark): SeenMark['name'] =>
  occurrence === true ? 'occurrence' : current ? 'current' : 'match';

export function seenRows({
  rows,
  parts,
  colored,
  marksOf,
  selection,
}: ShownRows): SeenRow[] {
  return rows.map((row, index) => {
    const part = parts[index];
    const from = part?.from ?? row.from;
    const to = part?.to ?? row.to;
    const selected = selectedIn(selection, row.row, { from, to });
    return {
      key: rowKey(row),
      text: row.row.text.slice(from, to),
      column: part?.column ?? 0,
      kinds: [
        ...new Set(
          piecesWithin(
            (colored && rowSegments(colored, row.row)) ?? [
              { text: row.row.text },
            ],
            from,
            to,
          ).map(({ kind }) => kind ?? plain),
        ),
      ],
      marks: marksWithin(marksOf(row), from, to).map((mark) => ({
        from: mark.start,
        to: mark.end,
        name: nameOf(mark),
      })),
      selected: selected && {
        from: selected.from - from,
        to: selected.to - from,
      },
      breakAt: row.breakAt,
      continues: row.to < row.row.text.length || row.row.cut === true,
    };
  });
}
