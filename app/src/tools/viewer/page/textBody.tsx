import { fontDotLook } from '../../../lib/page/dotLook';
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { type TextEncoding } from '../../../components/encodings/shared/textEncodings';
import { ScrollBody } from './scrollBody';
import type { Viewing } from './viewing';
import type { ViewerFind } from './find';
import { occurrencesOf, textMarks } from './markPieces';
import { useShell } from '../../../shell/page/store';
import { columnAt } from './columns';
import { cellWidthsOf, textWidths } from '../../../lib/page/textWidths';
import { plainCells, useCellTable } from '../../../lib/page/cellTable';
import { useViewer, useViewerActions } from './store';
import type { ViewerTabView } from './tabParts';
import { textEnds, textThumb } from './textScroll';
import { CellRows } from './cellRows';
import { gpuRefused, watchGpu } from './gpuDevice';
import { strings } from '../../../lib/shared/strings';
import type { ScreenRow } from './screenRows';
import { useTextRows } from './textRows';
import { steppedColumn, useSideways } from './textSideways';
import { useColors, useWholeText } from './wholeText';

const cellMargin = 64;

const aheadScreens = 3;

const noCopy = () => undefined;

export function TextBody({
  encoding,
  language,
  viewing,
  find,
  place,
  onPlace,
}: {
  encoding: TextEncoding;
  language: string | undefined;
  viewing: Viewing;
  find?: ViewerFind;
  place: () => number;
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
  const across = useViewer((state) =>
    steppedColumn(
      sidewaysOf(state.tabViews.get(viewing.tab)?.sideways)?.column ?? 0,
    ),
  );
  const sidewaysColumn = useRef<number>(undefined);
  const sidewaysLeft = useRef<number>(undefined);
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
  const dotLook = useMemo(
    () => fontDotLook(font.family, font.char, 1 / devicePixelRatio),
    [font],
  );
  const wordWrap = useShell((state) => state.textView.wordWrap);
  const showWhitespace = useShell((state) => state.textView.showWhitespace);
  const highlightOccurrences = useShell(
    (state) => state.textView.highlightOccurrences,
  );
  const refused = useSyncExternalStore(watchGpu, gpuRefused);
  const [copy, setCopy] = useState<string>();
  const copiesIn = useMemo(() => occurrencesOf(copy), [copy]);
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
  const shown = loaded.rows.slice(loaded.top, loaded.top + screen + 2);
  const { width, parts, partOf } = useSideways({
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
  const keepSideways = useCallback(() => {
    const kept = keptViewer(tab).sideways;
    const stored = kept?.body === sidewaysBody ? kept : undefined;
    keepViewer(tab, {
      sideways: {
        body: sidewaysBody,
        left: sidewaysLeft.current ?? stored?.left ?? 0,
        column: sidewaysColumn.current ?? stored?.column ?? 0,
      },
    });
  }, [keepViewer, keptViewer, tab, sidewaysBody]);
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
  const finding = find !== undefined && find.query !== '';
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
  const marksOf = (row: ScreenRow) =>
    find === undefined || !finding
      ? copiesIn(row.row.text)
      : textMarks(
          row.row,
          find.query,
          find.options,
          find.matches,
          find.current,
          encoding,
        );
  const shownColumns =
    columns !== undefined && Number.isFinite(columns) ? columns : 0;
  const firstCell = whole ? Math.max(0, across - cellMargin) : 0;
  const lastCell = whole
    ? Math.min(
        across + shownColumns + cellMargin,
        Math.max(width ?? 0, shownColumns),
      )
    : shownColumns + 2;

  return (
    <ScrollBody
      numbered
      matches={find?.matches}
      size={size}
      thumb={textThumb(loaded, screen, size ?? 0, perRow, lastTop)}
      ends={textEnds(loaded, screen, size ?? 0)}
      lead={loaded.top}
      onScreen={setMeasured}
      onColumns={setColumns}
      onFont={onFont}
      move={move}
      jump={jump}
      error={viewing.error ?? (refused ? strings.viewer.noGpu : undefined)}
      width={width}
      wrapped={!whole}
      onSideways={onAcross}
      keptLeft={sidewaysOf(keptViewer(viewing.tab).sideways)?.left}
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
    >
      {table !== undefined && (
        <CellRows
          rows={shown}
          parts={parts}
          wrapAt={wrapAt}
          colored={colored}
          marksOf={marksOf}
          showWhitespace={showWhitespace}
          widths={widths}
          font={font}
          dotLook={dotLook}
          ahead={[
            ...loaded.rows.slice(
              loaded.top + shown.length,
              loaded.top + shown.length * aheadScreens,
            ),
            ...loaded.rows
              .slice(Math.max(0, loaded.top - shown.length), loaded.top)
              .toReversed(),
          ].map((row) => ({ row, part: partOf(row) }))}
          held={loaded.rows}
          text={text?.text}
          onSelected={highlightOccurrences && !finding ? setCopy : noCopy}
          move={move}
          first={firstCell}
          columns={Math.max(1, lastCell - firstCell)}
        />
      )}
    </ScrollBody>
  );
}
