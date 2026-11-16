import type { CodeSnap } from './codeSnap';
import type { WrapColumns } from './rowMeasures';
import { sameTextMeasures, type TextMeasures } from './textLayout';

export interface DiffMeasures {
  readonly text: TextMeasures | undefined;
  readonly snap: CodeSnap;
  readonly wrapColumns: WrapColumns | undefined;
}

export interface DiffMeasuring {
  readonly measureText: (measures: TextMeasures) => void;
  readonly snapCode: (snap: (last: CodeSnap) => CodeSnap) => void;
  readonly keepWrapColumns: (columns: WrapColumns) => void;
}

export const unmeasuredDiff: DiffMeasures = {
  text: undefined,
  snap: { inline: 0, left: 0, right: 0 },
  wrapColumns: undefined,
};

export function withText(
  measures: DiffMeasures,
  text: TextMeasures,
): DiffMeasures {
  return sameTextMeasures(measures.text, text)
    ? measures
    : { ...measures, text };
}

export function withSnap(
  measures: DiffMeasures,
  snap: (last: CodeSnap) => CodeSnap,
): DiffMeasures {
  const next = snap(measures.snap);
  return next === measures.snap ? measures : { ...measures, snap: next };
}

export function withWrapColumns(
  measures: DiffMeasures,
  columns: WrapColumns,
): DiffMeasures {
  return measures.wrapColumns?.left === columns.left &&
    measures.wrapColumns.right === columns.right
    ? measures
    : { ...measures, wrapColumns: columns };
}
