import { useCallback, useMemo, useState } from 'react';
import { wholeLineBytes } from '../shared/protocol';
import { type TextEncoding } from '../../../components/encodings/shared/textEncodings';
import type { TextWidths } from '../../../lib/page/textWidths';
import { columnsOf, shownWithin, widestColumns } from './columns';
import { bytesOf } from './encodedBytes';
import type { ScreenRow } from './screenRows';
import type { WholeText } from './textColors';

const sidewaysStep = 32;

const sidewaysMargin = 64;

export function useSideways({
  whole,
  text,
  rows,
  shown,
  tab,
  encoding,
  counting,
  columns,
  keptColumn = 0,
}: {
  readonly whole: boolean;
  readonly text: WholeText | undefined;
  readonly rows: readonly ScreenRow[];
  readonly shown: readonly ScreenRow[];
  readonly tab: string;
  readonly encoding: TextEncoding;
  readonly counting: TextWidths;
  readonly columns: number | undefined;
  readonly keptColumn?: number;
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
            (most, row) => Math.max(most, columnsOf(row.row.text, counting)),
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
  const [across, setAcross] = useState(
    Math.floor(keptColumn / sidewaysStep) * sidewaysStep,
  );
  const onSideways = useCallback(
    (column: number) =>
      setAcross(Math.floor(column / sidewaysStep) * sidewaysStep),
    [],
  );
  const shownColumns =
    columns !== undefined && Number.isFinite(columns) ? columns : 0;
  const parts = shown.map((row) =>
    whole
      ? shownWithin(
          row.row.text,
          row.from,
          row.to,
          Math.max(0, across - sidewaysMargin),
          across + shownColumns + sidewaysMargin,
          counting,
        )
      : { from: row.from, to: row.to, column: row.indent },
  );
  return {
    width: whole && wide.key === widthKey ? wide.columns : undefined,
    onSideways,
    parts,
  };
}
