import { useLayoutEffect, useRef } from 'react';
import type { DotLook } from '../../../lib/page/dotLook';
import type { TextWidths } from '../../../lib/page/textWidths';
import type { CellFont } from './cellLook';
import type { RowPart } from './cellPainting';
import { CellView, viewKey } from './cellView';
import type { RowAhead } from './glyphWarmth';
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
  readonly ahead: readonly RowAhead[];
  readonly held: readonly ScreenRow[];
  readonly text: string | undefined;
  readonly onSelected: (copy: string | undefined) => void;
  readonly move: (rows: number) => void;
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
  ahead,
  held,
  text,
  onSelected,
  move,
  first,
  columns,
}: CellRowsProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<CellView>(undefined);
  const ratio = devicePixelRatio;
  useLayoutEffect(() => {
    const element = host.current;
    const around = element?.parentElement;
    if (!element || !around || !(font.char > 0) || widths === undefined) {
      return;
    }
    if (view.current?.key !== viewKey({ font, dotLook }, ratio)) {
      view.current?.dispose();
      view.current = new CellView(element, around, { font, dotLook });
    }
    view.current.show({
      shown: {
        rows,
        parts,
        wrapAt,
        colored,
        marksOf,
        showWhitespace,
        widths,
        first,
      },
      columns,
      ahead,
      held,
      text,
      events: { chosen: onSelected, move },
    });
  });
  useLayoutEffect(
    () => () => {
      view.current?.dispose();
      view.current = undefined;
    },
    [],
  );
  const advance = Math.round(font.char * ratio) / ratio;
  return (
    <div
      ref={host}
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
