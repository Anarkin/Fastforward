import type { ScreenRow } from '../../../components/cells/page/lines';
import { useMemo, useState } from 'react';
import { wholeLineBytes } from '../shared/protocol';
import { type TextEncoding } from '../../../components/encodings/shared/textEncodings';
import type { TextWidths } from '../../../lib/page/textWidths';
import {
  keptColumnsOf,
  shownWithin,
  widestColumns,
} from '../../../lib/page/columns';
import { bytesOf } from './encodedBytes';
import type { WholeText } from './textColors';

const sidewaysStep = 32;

const sidewaysMargin = 64;

export const steppedColumn = (column: number): number =>
  Math.floor(column / sidewaysStep) * sidewaysStep;

export function useSideways({
  whole,
  text,
  rows,
  shown,
  tab,
  encoding,
  counting,
  columns,
  across,
}: {
  readonly whole: boolean;
  readonly text: WholeText | undefined;
  readonly rows: readonly ScreenRow[];
  readonly shown: readonly ScreenRow[];
  readonly tab: string;
  readonly encoding: TextEncoding;
  readonly counting: TextWidths;
  readonly columns: number | undefined;
  readonly across: number;
}) {
  const widestLine = useMemo(
    () =>
      whole && text !== undefined
        ? widestColumns(
            text.text,
            counting,
            (line) => bytesOf(line, 0, line.length, encoding) <= wholeLineBytes,
          )
        : 0,
    [whole, text, counting, encoding],
  );
  const widest = useMemo(
    () =>
      whole
        ? rows.reduce(
            (most, row) =>
              Math.max(most, keptColumnsOf(row.row.text, counting)),
            widestLine,
          )
        : undefined,
    [rows, whole, counting, widestLine],
  );
  const widthKey = `${tab}:${encoding}`;
  const [wide, setWide] = useState({ key: widthKey, columns: 0 });
  if (
    widest !== undefined &&
    (wide.key !== widthKey || widest > wide.columns)
  ) {
    setWide({
      key: widthKey,
      columns: wide.key === widthKey ? Math.max(wide.columns, widest) : widest,
    });
  }
  const shownColumns =
    columns !== undefined && Number.isFinite(columns) ? columns : 0;
  const partOf = (row: ScreenRow) =>
    whole
      ? shownWithin(
          row.row.text,
          row.from,
          row.to,
          Math.max(0, across - sidewaysMargin),
          across + shownColumns + sidewaysMargin,
          counting,
        )
      : { from: row.from, to: row.to, column: row.indent };
  return {
    width: whole && wide.key === widthKey ? wide.columns : undefined,
    parts: shown.map(partOf),
    partOf,
  };
}
