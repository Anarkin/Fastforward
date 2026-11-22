import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { DotLook } from '../../../lib/page/dotLook';
import type { TextWidths } from '../../../lib/page/textWidths';
import type { CellFont } from './cellLook';
import type { RowPart, SegmentsOf } from './cellPainting';
import { seenRows } from './cellsSeen';
import { CellView, viewKey } from './cellView';
import type { RowAhead } from './glyphWarmth';
import { gpuDevice, gpuGeneration, watchGpu } from './gpuDevice';
import type { FindMark } from './markPieces';
import type { ScreenRow } from './screenRows';
import type { ColoredText } from './textColors';

interface CellRowsProps {
  readonly rows: readonly ScreenRow[];
  readonly parts: readonly (RowPart | undefined)[];
  readonly wrapAt: number | undefined;
  readonly colored: ColoredText | undefined;
  readonly segmentsOf: SegmentsOf | undefined;
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
  segmentsOf,
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
  const generation = useSyncExternalStore(watchGpu, gpuGeneration);
  const advance = Math.round(font.char * ratio) / ratio;
  useLayoutEffect(() => {
    const element = host.current;
    if (!element || widths === undefined) {
      return;
    }
    element.seenRows = () => {
      const box = (
        element.querySelector('canvas') ?? element
      ).getBoundingClientRect();
      const { left } = element.getBoundingClientRect();
      return seenRows(
        {
          rows,
          parts,
          wrapAt,
          segmentsOf,
          marksOf,
          showWhitespace,
          widths,
          first,
          selection: view.current?.selection,
        },
        {
          left,
          top: box.top,
          advance,
          rowHeight: box.height / Math.max(1, rows.length),
        },
      );
    };
  });
  useLayoutEffect(() => {
    const element = host.current;
    const around = element?.parentElement;
    const device = gpuDevice();
    if (
      !element ||
      !around ||
      !device ||
      !(font.char > 0) ||
      widths === undefined
    ) {
      return;
    }
    if (view.current?.key !== viewKey({ font, dotLook }, ratio, generation)) {
      view.current?.dispose();
      view.current = new CellView(device, generation, element, around, {
        font,
        dotLook,
      });
    }
    view.current.show({
      shown: {
        rows,
        parts,
        wrapAt,
        segmentsOf,
        marksOf,
        showWhitespace,
        widths,
        first,
      },
      columns,
      ahead,
      held,
      text,
      colored,
      events: { chosen: onSelected, move },
    });
  });
  useLayoutEffect(() => {
    const element = host.current;
    return () => {
      view.current?.dispose();
      view.current = undefined;
      if (element) {
        element.seenRows = undefined;
      }
    };
  }, []);
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
