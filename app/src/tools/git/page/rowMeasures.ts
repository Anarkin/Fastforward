import { memo } from 'react';
import {
  markedRowStarts,
  tabStop,
  type ColumnsIn,
  wrappedLines,
  type RowBreak,
} from '../../../lib/page/wordWrap';
import { inLines, measureInLines } from '../../../lib/page/lineHeight';
import type { TextWidths } from '../../../lib/page/textWidths';
import {
  type DiffRow,
  type CodeRow,
  isCode,
  diffRowKey,
  changeOf,
} from './diffRows';
import type { MinimapRow } from '../../../lib/page/minimap';

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
  whitespace: 1,
  sameContent: 1,
  mode: 1,
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

const tabCode = 9;

const lastAscii = 0x7f;

function spanOf(text: string, widths: TextWidths | undefined): TextSpan {
  const length = text.endsWith('\r') ? text.length - 1 : text.length;
  const measured =
    widths !== undefined && widths.char > 0 && beyondAscii.test(text);
  if (!measured && !text.includes('\t')) {
    return { columns: length, plain: true };
  }
  let columns = 0;
  for (let at = 0; at < length; at++) {
    const code = text.codePointAt(at) ?? 0;
    if (code === tabCode) {
      columns = tabStop(columns);
    } else if (code <= lastAscii || !measured) {
      columns += 1;
    } else {
      const character = String.fromCodePoint(code);
      columns += widths.of(character) / widths.char;
      at += character.length - 1;
    }
  }
  return { columns, plain: false };
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
    readonly spans: (readonly TextSpan[] | undefined)[];
  }
>();

function rowSpans(
  rows: readonly DiffRow[],
  widths: TextWidths | undefined,
): (readonly TextSpan[] | undefined)[] {
  let known = spansOfRows.get(rows);
  if (!known || known.widths !== widths) {
    known = { widths, spans: [] };
    spansOfRows.set(rows, known);
  }
  return known.spans;
}

const nearRows = 1000;

export function laidOutRowStarts(
  code: HTMLElement,
  lineHeight: number,
): number[] | undefined {
  const box = code.getBoundingClientRect();
  const rows = Math.round(box.height / lineHeight);
  if (rows < 2) {
    return [0];
  }
  const texts: { readonly node: Text; readonly start: number }[] = [];
  const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  let length = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof Text) {
      texts.push({ node, start: length });
      length += node.length;
    }
  }
  const range = document.createRange();
  const textAt = (offset: number) => {
    let low = 0;
    let high = texts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (texts[middle].start <= offset) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    const found = texts.at(low);
    return found && found.start <= offset ? found : undefined;
  };
  const rowOf = (offset: number) => {
    const at = textAt(offset);
    if (!at) {
      return 0;
    }
    range.setStart(at.node, offset - at.start);
    range.setEnd(at.node, Math.min(offset - at.start + 1, at.node.length));
    const rect = range.getBoundingClientRect();
    return Math.floor((rect.top + rect.height / 2 - box.top) / lineHeight);
  };
  return markedRowStarts(length, rows, rowOf);
}

interface RowInput {
  readonly row: DiffRow;
  readonly index: number;
  readonly inputs: readonly unknown[];
  readonly render: (row: DiffRow, index: number) => React.ReactNode;
}

export function sameRowInput(before: RowInput, after: RowInput): boolean {
  return (
    before.row === after.row &&
    before.index === after.index &&
    before.inputs.length === after.inputs.length &&
    before.inputs.every((input, at) => Object.is(input, after.inputs[at]))
  );
}

export const RowContent = memo(function RowContent({
  row,
  index,
  render,
}: RowInput) {
  return render(row, index);
}, sameRowInput);

const overscan = 30;

export function rowOverscan(dragged: boolean): number {
  return dragged ? 1 : overscan;
}

export const noBreaks: readonly RowBreak[] = [];

const mostRememberedBreaks = 20_000;

const rememberedBreaks = new WeakMap<
  ColumnsIn,
  Map<string, readonly RowBreak[]>
>();

const breaksKey = (text: string, columns: number, lineHeight: number) =>
  `${columns}\0${lineHeight}\0${text}`;

export function knownBreaks(
  text: string,
  columns: number,
  lineHeight: number,
  columnsIn: ColumnsIn | undefined,
): readonly RowBreak[] | undefined {
  if (columnsIn === undefined) {
    return undefined;
  }
  if (columnsIn(text)(text.length) < columns) {
    return noBreaks;
  }
  return rememberedBreaks
    .get(columnsIn)
    ?.get(breaksKey(text, columns, lineHeight));
}

export function rememberBreaks(
  text: string,
  columns: number,
  lineHeight: number,
  columnsIn: ColumnsIn,
  breaks: readonly RowBreak[],
): void {
  let remembered = rememberedBreaks.get(columnsIn);
  if (remembered === undefined) {
    remembered = new Map();
    rememberedBreaks.set(columnsIn, remembered);
  }
  remembered.set(breaksKey(text, columns, lineHeight), breaks);
  if (remembered.size > mostRememberedBreaks) {
    const [oldest] = remembered.keys();
    remembered.delete(oldest);
  }
}

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
): RowMeasures {
  let measures = measuresOfRows.get(rows);
  if (
    !measures ||
    measures.columns?.left !== columns?.left ||
    measures.columns?.right !== columns?.right ||
    measures.lineHeight !== lineHeight ||
    measures.ratio !== ratio ||
    measures.widths !== widths ||
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
): RowMeasures {
  const generation = wrapGeneration++;
  const wrapped: number[] = [];
  const spans = rowSpans(rows, widths);
  const wrappedRow = (row: CodeRow, index: number, wrapsAt: WrapColumns) => {
    const exact = wrapped[index];
    if (exact !== undefined) {
      return exact;
    }
    const spanned = (spans[index] ??= codeSpans(row, widths));
    if (onOneLine(spanned, wrapsAt)) {
      return lineHeight;
    }
    wrapped[index] =
      Math.abs(index - (near?.current ?? 0)) > nearRows
        ? guessedLines(spanned, wrapsAt) * lineHeight
        : wrappedHeight(row, wrapsAt, lineHeight, widths);
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

export const beyondAscii = /[^\0-\x7f]/;

export function minimapRows(
  rows: readonly DiffRow[],
  measured: (index: number) => number | undefined = () => undefined,
): MinimapRow[] {
  return rows.map((row, index) => ({
    height: measured(index) ?? rowHeight(row) ?? 0,
    change: changeOf(row),
  }));
}
