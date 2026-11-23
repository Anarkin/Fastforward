import type { FindMark } from '../../../components/cells/page/marks';
import type { SelectionShape } from '../../../components/cells/page/cellView';
import type { ScreenRow } from '../../../components/cells/page/lines';
import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { DotLook } from '../../../lib/page/dotLook';
import type { TextWidths } from '../../../lib/page/textWidths';
import type { CellFont } from '../../../components/cells/page/cellLook';
import type {
  RowPart,
  SegmentsOf,
} from '../../../components/cells/page/cellPainting';
import { seenRows } from '../../../components/cells/page/seen';
import {
  CellView,
  viewKey,
  type KeptText,
  type Warming,
} from '../../../components/cells/page/cellView';
import type { RowAhead } from '../../../components/cells/page/glyphWarmth';
import {
  gpuDevice,
  gpuGeneration,
  watchGpu,
} from '../../../components/cells/page/gpuDevice';
import { linesJob } from './lineWarmth';
import { rowLooks } from './rowLooks';
import type { ColoredText } from './textColors';

interface CellRowsProps {
  readonly rows: readonly ScreenRow[];
  readonly parts: readonly (RowPart | undefined)[];
  readonly wrapAt: number | undefined;
  readonly colored: ColoredText | undefined;
  readonly segmentsOf: SegmentsOf | undefined;
  readonly marksOf: (row: ScreenRow) => readonly FindMark[];
  readonly showWhitespace: boolean;
  readonly shape?: SelectionShape | undefined;
  readonly widths: TextWidths | undefined;
  readonly font: CellFont;
  readonly dotLook: DotLook | undefined;
  readonly ahead: readonly RowAhead[];
  readonly held: readonly ScreenRow[];
  readonly text: string | undefined;
  readonly onSelected: (copy: string | undefined) => void;
  readonly kept: KeptText | undefined;
  readonly onKept: (kept: KeptText | undefined) => void;
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
  shape,
  widths,
  font,
  dotLook,
  ahead,
  held,
  text,
  onSelected,
  kept,
  onKept,
  move,
  first,
  columns,
}: CellRowsProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<CellView>(undefined);
  const ratio = devicePixelRatio;
  const generation = useSyncExternalStore(watchGpu, gpuGeneration);
  const advance = Math.round(font.char * ratio) / ratio;
  const whole = colored?.parts.at(-1)?.done === true ? colored : undefined;
  const warming = useMemo(
    () =>
      text === undefined
        ? undefined
        : {
            job: (...[painting, look]: Parameters<Warming['job']>) =>
              linesJob(painting, look, text, whole),
          },
    [text, whole],
  );
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
          shape,
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
      view.current = new CellView(
        device,
        generation,
        element,
        around,
        { font, dotLook },
        rowLooks,
      );
    }
    view.current.show({
      shown: {
        rows,
        parts,
        wrapAt,
        segmentsOf,
        marksOf,
        showWhitespace,
        shape,
        widths,
        first,
      },
      columns,
      ahead,
      held,
      partial: true,
      warming,
      kept,
      events: { chosen: onSelected, kept: onKept, move },
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
