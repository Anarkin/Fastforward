import { useCallback, useMemo, useRef, useState } from 'react';
import { type TextEncoding } from '../../../components/encodings/shared/textEncodings';
import { ScrollBody } from './scrollBody';
import type { Viewing } from './viewing';
import type { ViewerFind } from './viewerFind';
import { textMarks } from './markPieces';
import { useShell } from '../../../shell/page/store';
import { columnAt } from './columns';
import { cellWidthsOf, textWidths } from '../../../lib/page/textWidths';
import { plainCells, useCellTable } from '../../../lib/page/cellTable';
import { useViewer, useViewerActions } from './store';
import type { ViewerTabView } from './viewerKept';
import { textThumb } from './textScroll';
import { TextRow } from './textRow';
import { useTextRows } from './textRows';
import { steppedColumn, useSideways } from './textSideways';
import { useColors, useWholeText } from './wholeText';

export function TextBody({
  encoding,
  language,
  viewing,
  find,
  finding = false,
  place,
  onPlace,
}: {
  encoding: TextEncoding;
  language: string | undefined;
  viewing: Viewing;
  find?: ViewerFind;
  finding?: boolean;
  place: React.RefObject<number>;
  onPlace: (byte: number) => void;
}) {
  const {
    request: post,
    listenViewer: listen,
    keptViewer,
    keepViewer,
  } = useViewerActions();
  const sidewaysBody = `text ${encoding}`;
  const sidewaysOf = (
    sideways: ViewerTabView['sideways'],
  ): ViewerTabView['sideways'] =>
    sideways?.body === sidewaysBody ? sideways : undefined;
  const keptSideways = sidewaysOf(keptViewer(viewing.tab).sideways);
  const across = useViewer((state) =>
    steppedColumn(
      sidewaysOf(state.tabViews.get(viewing.tab)?.sideways)?.column ?? 0,
    ),
  );
  const sidewaysColumn = useRef(keptSideways?.column ?? 0);
  const sidewaysLeft = useRef(keptSideways?.left ?? 0);
  const [measured, setMeasured] = useState<number>();
  const screen = measured ?? 1;
  const [columns, setColumns] = useState<number>();
  const [font, setFont] = useState({ char: 0, family: '', spacing: 0 });
  const onFont = useCallback(
    (char: number, family: string, spacing: number) =>
      setFont((last) =>
        last.char === char && last.family === family && last.spacing === spacing
          ? last
          : { char, family, spacing },
      ),
    [],
  );
  const table = useCellTable();
  const widths = useMemo(
    () =>
      font.char > 0 && table !== undefined
        ? textWidths(font.char, font.family, font.spacing, table)
        : undefined,
    [font, table],
  );
  const counting = widths ?? cellWidthsOf(table ?? plainCells);
  const wordWrap = useShell((state) => state.textView.wordWrap);
  const showWhitespace = useShell((state) => state.textView.showWhitespace);
  const wrapAt =
    wordWrap && columns !== undefined && Number.isFinite(columns)
      ? columns
      : undefined;
  const least = wrapAt === undefined ? screen * 3 : 1;
  const { rows, loaded, move, jump, perRow, lastTop } = useTextRows({
    post,
    listen,
    viewing,
    encoding,
    measured,
    screen,
    wrapAt,
    counting,
    least,
    place,
    onPlace,
    find,
  });
  const { tab, size } = viewing;
  const whole = wrapAt === undefined;
  const text = useWholeText(viewing, language !== undefined || whole, encoding);
  const colored = useColors(tab, language, encoding, text);
  const shown = loaded.rows.slice(loaded.top, loaded.top + screen + 1);
  const { width, parts } = useSideways({
    whole,
    text,
    rows,
    shown,
    tab,
    encoding,
    counting,
    columns,
    across,
  });
  const keepSideways = useCallback(
    () =>
      keepViewer(tab, {
        sideways: {
          body: sidewaysBody,
          left: sidewaysLeft.current,
          column: sidewaysColumn.current,
        },
      }),
    [keepViewer, tab, sidewaysBody],
  );
  const onAcross = useCallback(
    (column: number) => {
      sidewaysColumn.current = column;
      if (steppedColumn(column) !== across) {
        keepSideways();
      }
    },
    [across, keepSideways],
  );
  const onLeft = useCallback(
    (left: number) => {
      sidewaysLeft.current = left;
      keepSideways();
    },
    [keepSideways],
  );
  const texts = new Map(
    shown.map((row, index) => [
      `${row.row.start}:${row.from}`,
      {
        text: row.row.text.slice(row.from, row.to),
        from: (parts[index]?.from ?? row.from) - row.from,
      },
    ]),
  );
  const rowText = (element: Element) =>
    texts.get(element.getAttribute('data-key') ?? '');
  const target = find?.current;
  const matched =
    whole && target !== undefined
      ? shown.find((row) => target.start >= row.start && target.start < row.end)
      : undefined;
  const matchStart =
    matched === undefined || find === undefined
      ? undefined
      : textMarks(
          matched.row,
          find.query,
          find.options,
          find.matches,
          target,
          encoding,
        ).find((mark) => mark.current)?.start;
  const jumps = find?.jump ?? 0;

  return (
    <ScrollBody
      numbered
      barPinned={finding}
      matches={find?.matches}
      size={size}
      thumb={textThumb(loaded, screen, size ?? 0, perRow, lastTop)}
      onScreen={setMeasured}
      onColumns={setColumns}
      onFont={onFont}
      move={move}
      jump={jump}
      error={viewing.error}
      width={width}
      wrapped={!whole}
      onSideways={onAcross}
      keptLeft={keptSideways?.left}
      settled={text !== undefined && widths !== undefined}
      onLeft={onLeft}
      reveal={
        matched === undefined || matchStart === undefined
          ? undefined
          : {
              column: columnAt(matched.row.text, matchStart, 0, counting),
              asked: jumps,
            }
      }
      rowText={rowText}
    >
      {table !== undefined &&
        shown.map((row, index) => (
          <TextRow
            key={`${row.row.start}:${row.from}`}
            row={row}
            part={parts[index]}
            colored={colored}
            marks={
              find === undefined
                ? []
                : textMarks(
                    row.row,
                    find.query,
                    find.options,
                    find.matches,
                    find.current,
                    encoding,
                  )
            }
            showWhitespace={showWhitespace}
            widths={widths}
          />
        ))}
    </ScrollBody>
  );
}
