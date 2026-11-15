import { matchMarks, minimapMarks, type MinimapMark } from './minimapMarks';
import type { DiffRow } from './diffRows';
import { minimapRows } from './rowMeasures';

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
