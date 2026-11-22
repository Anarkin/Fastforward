import { useEffect, useLayoutEffect, useRef } from 'react';
import type { DotLook } from '../../../lib/page/dotLook';
import type { TextWidths } from '../../../lib/page/textWidths';
import type { CellFont } from './cellLook';
import type { RowPart } from './cellPainting';
import { CellView } from './cellView';
import type { FindMark } from './markPieces';
import type { ScreenRow } from './screenRows';
import type { ColoredText } from './textColors';

interface CellRowsProps {
  readonly rows: readonly ScreenRow[];
  readonly parts: readonly (RowPart | undefined)[];
  readonly wrapAt: number | undefined;
  readonly colored: ColoredText | undefined;
  readonly marksOf: (row: ScreenRow) => readonly FindMark[];
  readonly showWhitespace: boolean;
  readonly widths: TextWidths | undefined;
  readonly font: CellFont;
  readonly dotLook: DotLook | undefined;
  readonly first: number;
  readonly columns: number;
}

export function CellRows({
  rows,
  parts,
  wrapAt,
  colored,
  marksOf,
  showWhitespace,
  widths,
  font,
  dotLook,
  first,
  columns,
}: CellRowsProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<CellView>(undefined);
  const ratio = devicePixelRatio;
  const look = `${font.family}|${font.char}|${font.spacing}|${ratio}`;
  useLayoutEffect(() => {
    const element = canvas.current;
    const host = element?.parentElement;
    if (!element || !host || !(font.char > 0) || widths === undefined) {
      return;
    }
    if (view.current?.canvas !== element) {
      view.current?.dispose();
      view.current = new CellView(element, host, { font, dotLook });
    }
    view.current.show(
      { rows, parts, wrapAt, colored, marksOf, showWhitespace, widths, first },
      columns,
    );
  });
  useEffect(
    () => () => {
      view.current?.dispose();
      view.current = undefined;
    },
    [],
  );
  const advance = Math.round(font.char * ratio) / ratio;
  return (
    <canvas
      key={look}
      ref={canvas}
      className="cell-rows"
      data-rows={rows.length > 0 ? rows.length : undefined}
      data-colored={
        colored !== undefined && colored.parts.length > 0 ? '' : undefined
      }
      style={{
        marginLeft: first * advance,
        width: columns * advance,
        height: `calc(${rows.length} * var(--viewer-row-height))`,
      }}
    />
  );
}
