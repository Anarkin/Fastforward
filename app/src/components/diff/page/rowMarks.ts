import type { Virtualizer } from '@tanstack/react-virtual';
import { useDeferredValue, useMemo } from 'react';
import { matchMarks, changedMarks, type ChangeMark } from './changeMarks';
import type { DiffRow } from './rows';
import { markedRows } from './rowMeasures';

interface MarksInput {
  readonly rows: readonly DiffRow[];
  readonly currentKey: string | undefined;
  readonly keys: readonly (readonly string[])[];
  readonly matched: ReadonlyMap<string, unknown>;
  readonly least: number;
  readonly measurements: readonly { readonly size: number }[];
}

const noMarksInput: MarksInput = {
  rows: [],
  currentKey: undefined,
  keys: [],
  matched: new Map(),
  least: 0,
  measurements: [],
};

export function diffMarks(
  rows: readonly DiffRow[],
  keys: readonly (readonly string[])[],
  matchedLines: ReadonlyMap<string, unknown>,
  least: number,
  measured?: (index: number) => number | undefined,
  currentKey?: string,
): ChangeMark[] {
  const heights = markedRows(rows, measured);
  const matched = new Set(
    keys.flatMap((row, index) =>
      row.some((key) => matchedLines.has(key)) ? [index] : [],
    ),
  );
  const current = keys.findIndex((row) =>
    row.some((key) => key === currentKey),
  );
  return [
    ...changedMarks(heights, least),
    ...matchMarks(heights, matched, least),
    ...(current === -1
      ? []
      : matchMarks(heights, new Set([current]), least).map((mark) => ({
          ...mark,
          kind: 'current' as const,
        }))),
  ];
}

export function useDiffMarks({
  rows,
  keys,
  rangesByLine,
  currentKey,
  least,
  virtualizer,
}: {
  readonly rows: readonly DiffRow[];
  readonly currentKey: string | undefined;
  readonly keys: readonly (readonly string[])[];
  readonly rangesByLine: ReadonlyMap<string, unknown>;
  readonly least: number;
  readonly virtualizer: Virtualizer<HTMLDivElement, Element>;
}): ChangeMark[] {
  const measurements = virtualizer.measurementsCache;
  const marksInput = useDeferredValue(
    useMemo(
      () => ({
        rows,
        currentKey,
        keys,
        matched: rangesByLine,
        least,
        measurements,
      }),
      [rows, currentKey, keys, rangesByLine, least, measurements],
    ),
    noMarksInput,
  );
  const marks = useMemo(
    () =>
      diffMarks(
        marksInput.rows,
        marksInput.keys,
        marksInput.matched,
        marksInput.least,
        (index) => marksInput.measurements[index]?.size,
        marksInput.currentKey,
      ),
    [marksInput],
  );
  return marks;
}
