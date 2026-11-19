import type { Virtualizer } from '@tanstack/react-virtual';
import { useDeferredValue, useMemo } from 'react';
import { matchMarks, changedMarks, type ChangeMark } from './changeMarks';
import type { DiffRow } from './rows';
import { markedRows } from './rowMeasures';

interface MarksInput {
  readonly rows: readonly DiffRow[];
  readonly keys: readonly (readonly string[])[];
  readonly matched: ReadonlyMap<string, unknown>;
  readonly changeMarks: boolean;
  readonly measurements: readonly { readonly size: number }[];
}

const noMarksInput: MarksInput = {
  rows: [],
  keys: [],
  matched: new Map(),
  changeMarks: false,
  measurements: [],
};

export function diffMarks(
  rows: readonly DiffRow[],
  keys: readonly (readonly string[])[],
  matchedLines: ReadonlyMap<string, unknown>,
  changeMarks: boolean,
  measured?: (index: number) => number | undefined,
): ChangeMark[] {
  const heights = markedRows(rows, measured);
  const matched = new Set(
    keys.flatMap((row, index) =>
      row.some((key) => matchedLines.has(key)) ? [index] : [],
    ),
  );
  return [
    ...(changeMarks ? changedMarks(heights) : []),
    ...matchMarks(heights, matched),
  ];
}

export function useDiffMarks({
  rows,
  keys,
  rangesByLine,
  changeMarks,
  virtualizer,
}: {
  readonly rows: readonly DiffRow[];
  readonly keys: readonly (readonly string[])[];
  readonly rangesByLine: ReadonlyMap<string, unknown>;
  readonly changeMarks: boolean;
  readonly virtualizer: Virtualizer<HTMLDivElement, Element>;
}): ChangeMark[] {
  const measurements = virtualizer.measurementsCache;
  const marksInput = useDeferredValue(
    useMemo(
      () => ({
        rows,
        keys,
        matched: rangesByLine,
        changeMarks,
        measurements,
      }),
      [rows, keys, rangesByLine, changeMarks, measurements],
    ),
    noMarksInput,
  );
  const marks = useMemo(
    () =>
      diffMarks(
        marksInput.rows,
        marksInput.keys,
        marksInput.matched,
        marksInput.changeMarks,
        (index) => marksInput.measurements[index]?.size,
      ),
    [marksInput],
  );
  return marks;
}
