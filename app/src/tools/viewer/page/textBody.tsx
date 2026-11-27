import { occurrencesOf } from '../../../components/cells/page/marks';
import type { ScreenRow } from '../../../components/cells/page/lines';
import { useCallback, useMemo, useRef, useState } from 'react';
import { type TextEncoding } from '../../../components/encodings/shared/textEncodings';
import { ScrollBody } from './scrollBody';
import type { Viewing } from './viewing';
import type { ViewerFind } from './find';
import { textMarks } from './markPieces';
import { useShell } from '../../../shell/page/store';
import { columnAt } from '../../../components/cells/page/columns';
import { cellWidthsOf, withTabSize } from '../../../lib/page/textWidths';
import { plainCells } from '../../../lib/page/cellTable';
import { useCellFont } from '../../../components/cells/page/cellFont';
import { useViewer, useViewerActions } from './store';
import { useKeptSelection } from './tabSelection';
import type { ViewerTabView } from './tabParts';
import { textEnds, textThumb } from './textScroll';
import { CellRows } from './cellRows';
import { useTextRows } from './textRows';
import { steppedColumn, useSideways } from './textSideways';
import { segmentsFrom } from './textColors';
import { useColors, useWholeText } from './wholeText';
import { wholeFile } from './wholeFile';

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
    copyWhole,
  } = useViewerActions();
  const allAsked = useViewer((state) => state.allAsked);
  const all = useMemo(() => wholeFile(viewing.size ?? 0), [viewing.size]);
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
  const tabSize = useViewer((state) =>
    state.fileTabSizes.get(viewing.tab),
  )?.size;
  const { font, onFont, table, widths, dotLook } = useCellFont(tabSize);
  const counting =
    widths ?? withTabSize(cellWidthsOf(table ?? plainCells), tabSize);
  const wordWrap = useShell((state) => state.textView.wordWrap);
  const showWhitespace = useShell((state) => state.textView.showWhitespace);
  const highlightOccurrences = useShell(
    (state) => state.textView.highlightOccurrences,
  );
  const [copy, setCopy] = useState<string>();
  const { kept: keptSelection, onKept } = useKeptSelection(
    viewing.tab,
    `text ${encoding}`,
    viewing.version,
  );
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
  const segmentsOf = useMemo(() => colored && segmentsFrom(colored), [colored]);
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
      currentMatch={find?.current}
      size={size}
      thumb={textThumb(loaded, screen, size ?? 0, perRow, lastTop)}
      ends={textEnds(loaded, screen, size ?? 0)}
      lead={loaded.top}
      onScreen={setMeasured}
      onColumns={setColumns}
      onFont={onFont}
      move={move}
      jump={jump}
      jumps={jumps}
      error={viewing.error}
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
          segmentsOf={segmentsOf}
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
          kept={keptSelection}
          onKept={onKept}
          move={move}
          first={firstCell}
          columns={Math.max(1, lastCell - firstCell)}
          allAsked={allAsked}
          all={all}
          onCopiedAll={() => copyWhole('text', encoding)}
        />
      )}
    </ScrollBody>
  );
}
