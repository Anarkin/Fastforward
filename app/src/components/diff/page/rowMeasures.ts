import { rowWidths, type TabSizeOf } from './fileWidths';
import { columnsOf } from '../../../lib/page/columns';
import { wrappedLines } from '../../../lib/page/wordWrap';
import { inLines, measureInLines } from '../../../lib/page/lineHeight';
import type { TextWidths } from '../../../lib/page/textWidths';
import {
  type DiffRow,
  type CodeRow,
  isCode,
  diffRowKey,
  changeOf,
} from './rows';
import type { MarkedRow } from './changeMarks';

type MeasuredKind = 'error' | 'skeleton' | 'skeletonLines';

export const uniformHeight = 22;

export const rowLines: Record<
  Exclude<DiffRow['kind'], MeasuredKind | CodeRow['kind']>,
  number
> = {
  file: 1,
  large: 2,
  binary: 1,
  empty: 1,
  link: 1,
  noNewline: 1,
  image: 19,
  hunk: 1,
};

const measuredEstimates: Record<MeasuredKind, number> = {
  error: 200,
  skeleton: 240,
  skeletonLines: 100,
};

function isMeasured(kind: DiffRow['kind']): kind is MeasuredKind {
  return kind in measuredEstimates;
}

export interface WrapColumns {
  readonly left: number;
  readonly right: number;
}

function wrappedHeight(
  row: CodeRow,
  columns: WrapColumns,
  lineHeight: number,
  widths: TextWidths | undefined,
): number {
  const lines =
    row.kind === 'split'
      ? Math.max(
          row.left ? wrappedLines(row.left.line.text, columns.left, widths) : 1,
          row.right
            ? wrappedLines(row.right.line.text, columns.right, widths)
            : 1,
        )
      : wrappedLines(
          row.kind === 'line' ? row.line.text : row.text,
          columns.left,
          widths,
        );
  return lines * lineHeight;
}

interface TextSpan {
  readonly columns: number;
  readonly plain: boolean;
}

const noSpan: TextSpan = { columns: 0, plain: true };

function spanOf(text: string, widths: TextWidths | undefined): TextSpan {
  const length = text.endsWith('\r') ? text.length - 1 : text.length;
  const measured =
    widths !== undefined && widths.char > 0 && beyondAscii.test(text);
  if (!measured && !text.includes('\t')) {
    return { columns: length, plain: true };
  }
  return {
    columns: columnsOf(text.slice(0, length), measured ? widths : undefined),
    plain: false,
  };
}

function codeSpans(
  row: CodeRow,
  widths: TextWidths | undefined,
): readonly TextSpan[] {
  switch (row.kind) {
    case 'split':
      return [row.left, row.right].map((cell) =>
        cell ? spanOf(cell.line.text, widths) : noSpan,
      );
    case 'line':
      return [spanOf(row.line.text, widths)];
    case 'wholeLine':
      return [spanOf(row.text, widths)];
    default:
      return row satisfies never;
  }
}

const sideColumns = (columns: WrapColumns, side: number) =>
  side === 0 ? columns.left : columns.right;

function onOneLine(spans: readonly TextSpan[], columns: WrapColumns): boolean {
  for (const [side, span] of spans.entries()) {
    if (!span.plain || span.columns > sideColumns(columns, side)) {
      return false;
    }
  }
  return true;
}

function guessedLines(
  spans: readonly TextSpan[],
  columns: WrapColumns,
): number {
  let lines = 1;
  for (const [side, span] of spans.entries()) {
    lines = Math.max(
      lines,
      Math.ceil(span.columns / sideColumns(columns, side)),
    );
  }
  return lines;
}

const spansOfRows = new WeakMap<
  readonly DiffRow[],
  {
    readonly widths: TextWidths | undefined;
    readonly tabSizeOfFile: TabSizeOf | undefined;
    readonly spans: (readonly TextSpan[] | undefined)[];
  }
>();

function rowSpans(
  rows: readonly DiffRow[],
  widths: TextWidths | undefined,
  tabSizeOfFile: TabSizeOf | undefined,
): (readonly TextSpan[] | undefined)[] {
  let known = spansOfRows.get(rows);
  if (
    !known ||
    known.widths !== widths ||
    known.tabSizeOfFile !== tabSizeOfFile
  ) {
    known = { widths, tabSizeOfFile, spans: [] };
    spansOfRows.set(rows, known);
  }
  return known.spans;
}

const nearRows = 1000;

interface RowMeasures {
  readonly estimateSize: (index: number) => number;
  readonly getItemKey: (index: number) => string;
  readonly measureElement: (
    element: Element,
    entry: ResizeObserverEntry | undefined,
  ) => number;
  readonly columns: WrapColumns | undefined;
  readonly lineHeight: number;
  readonly ratio: number;
  readonly widths: TextWidths | undefined;
  readonly tabSizeOfFile: TabSizeOf | undefined;
  readonly near: ShownRow | undefined;
  readonly errorShown: boolean;
}

interface ShownRow {
  readonly current: number;
}

const measuresOfRows = new WeakMap<readonly DiffRow[], RowMeasures>();

let wrapGeneration = 0;

export function rowMeasures(
  rows: readonly DiffRow[],
  columns?: WrapColumns,
  lineHeight = uniformHeight,
  ratio = 1,
  widths?: TextWidths,
  near?: ShownRow,
  errorShown = true,
  tabSizeOfFile?: TabSizeOf,
): RowMeasures {
  let measures = measuresOfRows.get(rows);
  if (
    !measures ||
    measures.columns?.left !== columns?.left ||
    measures.columns?.right !== columns?.right ||
    measures.lineHeight !== lineHeight ||
    measures.ratio !== ratio ||
    measures.widths !== widths ||
    measures.tabSizeOfFile !== tabSizeOfFile ||
    measures.near !== near ||
    measures.errorShown !== errorShown
  ) {
    measures = measuresOf(
      rows,
      columns,
      lineHeight,
      ratio,
      widths,
      near,
      errorShown,
      tabSizeOfFile,
    );
    measuresOfRows.set(rows, measures);
  }
  return measures;
}

function measuresOf(
  rows: readonly DiffRow[],
  columns: WrapColumns | undefined,
  lineHeight: number,
  ratio: number,
  widths: TextWidths | undefined,
  near: ShownRow | undefined,
  errorShown: boolean,
  tabSizeOfFile: TabSizeOf | undefined,
): RowMeasures {
  const generation = wrapGeneration++;
  const wrapped: number[] = [];
  const spans = rowSpans(rows, widths, tabSizeOfFile);
  const wrappedRow = (row: CodeRow, index: number, wrapsAt: WrapColumns) => {
    const exact = wrapped[index];
    if (exact !== undefined) {
      return exact;
    }
    const rowWidthsShown = widths && rowWidths(widths, tabSizeOfFile, row);
    const spanned = (spans[index] ??= codeSpans(row, rowWidthsShown));
    if (onOneLine(spanned, wrapsAt)) {
      return lineHeight;
    }
    wrapped[index] =
      Math.abs(index - (near?.current ?? 0)) > nearRows
        ? guessedLines(spanned, wrapsAt) * lineHeight
        : wrappedHeight(row, wrapsAt, lineHeight, rowWidthsShown);
    return wrapped[index];
  };
  return {
    estimateSize: (index) => {
      const row = rows[index];
      if (isCode(row)) {
        return columns ? wrappedRow(row, index, columns) : lineHeight;
      }
      const kind = row.kind;
      if (kind === 'error' && !errorShown) {
        return 0;
      }
      return isMeasured(kind)
        ? inLines(measuredEstimates[kind], lineHeight)
        : rowLines[kind] * lineHeight;
    },
    getItemKey: (index) => {
      const key = diffRowKey(rows[index], index);
      return columns && isCode(rows[index]) ? `${key}:${generation}` : key;
    },
    measureElement: measureInLines(lineHeight, ratio),
    columns,
    lineHeight,
    ratio,
    widths,
    tabSizeOfFile,
    near,
    errorShown,
  };
}

const plainText = /^[\x20-\x7e]*\r?$/;

function fitsOneLine(text: string, columns: number): boolean {
  const length = text.endsWith('\r') ? text.length - 1 : text.length;
  return length < columns && plainText.test(text);
}

function codeFits(row: CodeRow, columns: WrapColumns): boolean {
  switch (row.kind) {
    case 'split':
      return (
        (row.left === undefined ||
          fitsOneLine(row.left.line.text, columns.left)) &&
        (row.right === undefined ||
          fitsOneLine(row.right.line.text, columns.right))
      );
    case 'line':
      return fitsOneLine(row.line.text, columns.left);
    case 'wholeLine':
      return fitsOneLine(row.text, columns.left);
    default:
      return row satisfies never;
  }
}

export function rowHeight(
  row: DiffRow,
  wrap = false,
  lineHeight = uniformHeight,
  columns?: WrapColumns,
): number | undefined {
  if (isCode(row)) {
    return !wrap || (columns !== undefined && codeFits(row, columns))
      ? lineHeight
      : undefined;
  }
  const kind = row.kind;
  return isMeasured(kind) ? undefined : rowLines[kind] * lineHeight;
}

const beyondAscii = /[^\0-\x7f]/;

export function markedRows(
  rows: readonly DiffRow[],
  measured: (index: number) => number | undefined = () => undefined,
): MarkedRow[] {
  return rows.map((row, index) => ({
    height: measured(index) ?? rowHeight(row) ?? 0,
    change: changeOf(row),
  }));
}
