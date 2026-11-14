import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useEffectEvent,
} from 'react';
import {
  maxColoredBytes,
  maxRowsAsked,
  wholeLineBytes,
  type TextEncoding,
  type TextRow,
} from '../shared/protocol';
import { RowRequests } from './rowRequests';
import {
  coloredText,
  rowSegments,
  wholeText,
  withPart,
  type ColoredText,
  type WholeText,
} from './textColors';
import { colorer } from '../../../lib/page/syntax';
import { ScrollBody, type Thumb } from './scrollBody';
import type { Viewing } from './viewer';
import type { ViewerFind } from './viewerFind';
import { MarkedText, textMarks, type FindMark } from './findMarks';
import {
  bytesOf,
  firstOf,
  marksWithin,
  piecesWithin,
  rowWithByte,
  rowWithChar,
  screenRows,
  type ScreenRow,
} from './screenRows';
import { useShell } from '../../../shell/page/store';
import { columnAt, columnsOf, shownWithin, widestColumns } from './columns';
import { strings } from '../../../lib/shared/strings';
import { blankRuns } from '../../../lib/page/wordWrap';
import {
  cellWidthsOf,
  plainCells,
  textWidths,
  useCellTable,
  type TextWidths,
} from '../../../lib/page/textWidths';
import { useCommanderActions } from './store';

const rowsAboveMatch = 2;

const sidewaysStep = 32;

const marksColumns = 2;

const sidewaysMargin = 64;

interface Span {
  readonly start: number;
  readonly end: number;
}

interface Loaded {
  readonly rows: readonly Span[];
  readonly top: number;
}

interface Place {
  readonly index: number;
  readonly from: number;
}

interface Read {
  readonly rows: readonly TextRow[];
  readonly top: Place;
}

interface Shown {
  readonly read: readonly TextRow[];
  readonly rows: readonly ScreenRow[];
  readonly top: number;
}

interface Ask {
  readonly anchor: number;
  readonly exact: boolean;
  readonly before: number;
  readonly after: number;
  readonly topOf: (first: number, rows: readonly ScreenRow[]) => number;
  readonly follow?: boolean;
  readonly refill?: boolean;
}

interface Placing {
  readonly ask: Ask;
  by: number;
}

const placeOf = (row: ScreenRow | undefined): Place => ({
  index: row?.index ?? 0,
  from: row?.from ?? 0,
});

export function topWithin(top: number, count: number, screen: number): number {
  return Math.max(0, Math.min(top, count - screen));
}

export function scrolled(
  loaded: Loaded,
  by: number,
  screen: number,
  size: number,
): { readonly top: number; readonly refill: boolean } | undefined {
  const first = loaded.rows[0];
  const last = loaded.rows.at(-1);
  if (first === undefined || last === undefined) {
    return undefined;
  }
  const atStart = first.start === 0;
  const atEnd = last.end >= size;
  const lastTop = Math.max(0, loaded.rows.length - screen);
  const wanted = loaded.top + by;
  if ((wanted < 0 && !atStart) || (wanted > lastTop && !atEnd)) {
    return undefined;
  }
  const top = Math.max(0, Math.min(wanted, lastTop));
  return {
    top,
    refill: (!atStart && top < screen) || (!atEnd && top > lastTop - screen),
  };
}

export function bytesPerRow(rows: readonly Span[]): number | undefined {
  const first = rows[0];
  const last = rows.at(-1);
  return first === undefined || last === undefined
    ? undefined
    : Math.max(1, (last.end - first.start) / rows.length);
}

function lastScreenStart(
  size: number,
  screen: number,
  perRow: number,
  known: number | undefined,
): number {
  return known ?? Math.max(0, size - screen * perRow);
}

export function textThumb(
  loaded: Loaded,
  screen: number,
  size: number,
  perRow: number | undefined,
  lastTop: number | undefined,
): Thumb | undefined {
  const first = loaded.rows[loaded.top];
  if (first === undefined || size <= 0) {
    return undefined;
  }
  const bytes = perRow ?? bytesPerRow(loaded.rows) ?? 1;
  const end = lastScreenStart(size, screen, bytes, lastTop);
  return {
    start: end > 0 ? Math.min(1, first.start / end) : 0,
    length: Math.min(1, screen / (size / bytes)),
  };
}

function RowText({
  shown,
  from,
  to,
  colored,
  marks,
  blanks,
  widths,
}: {
  shown: ScreenRow;
  from: number;
  to: number;
  colored: ColoredText | undefined;
  marks: readonly FindMark[];
  blanks: boolean;
  widths: TextWidths | undefined;
}) {
  const { row } = shown;
  const pieces = (colored && rowSegments(colored, row)) ?? [{ text: row.text }];
  return (
    <MarkedText
      pieces={piecesWithin(pieces, from, to)}
      marks={marksWithin(marks, from, to)}
      blanks={blanks}
      widths={widths}
    />
  );
}

export function useWholeText(
  viewing: Viewing,
  wanted: boolean,
  encoding: TextEncoding,
): WholeText | undefined {
  const [text, setText] = useState<WholeText>();
  const { readWholeText } = useCommanderActions();
  useEffect(() => {
    const { tab, size } = viewing;
    if (!wanted || size === undefined || size > maxColoredBytes) {
      return undefined;
    }
    return readWholeText(tab, encoding, (read) => setText(wholeText(read)));
  }, [wanted, viewing, encoding, readWholeText]);
  return text;
}

function useColors(
  language: string | undefined,
  encoding: TextEncoding,
  whole: WholeText | undefined,
): ColoredText | undefined {
  const [colored, setColored] = useState<ColoredText>();
  useEffect(() => {
    if (language === undefined || whole === undefined) {
      return undefined;
    }
    const plain = coloredText(whole.text, encoding, whole.marked);
    return colorer().colorParts(language, whole.text, (part) => {
      if (part !== undefined) {
        setColored((shown) =>
          withPart(shown?.lines === plain.lines ? shown : plain, part),
        );
      }
    });
  }, [language, whole, encoding]);
  return language === undefined ? undefined : colored;
}

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
  const { request: post, listenViewer: listen } = useCommanderActions();
  const [read, setRead] = useState<Read>({
    rows: [],
    top: { index: 0, from: 0 },
  });
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
    wordWrap && columns !== undefined && columns > marksColumns
      ? columns - marksColumns
      : undefined;
  const least = wrapAt === undefined ? screen * 3 : 1;
  const rows = useMemo(
    () => screenRows(read.rows, wrapAt, encoding, counting),
    [read.rows, wrapAt, encoding, counting],
  );
  const loaded: Shown = {
    read: read.rows,
    rows,
    top: topWithin(
      rowWithChar(rows, firstOf(rows, read.top.index), read.top.from),
      rows.length,
      screen,
    ),
  };
  const current = useRef(loaded);
  useLayoutEffect(() => {
    current.current = loaded;
  });
  const topStart = loaded.rows[loaded.top]?.start;
  useEffect(() => {
    if (topStart !== undefined) {
      onPlace(topStart);
    }
  }, [topStart, onPlace]);
  const { tab, size, version } = viewing;
  const [lastScreen, setLastScreen] = useState<{
    readonly size: number | undefined;
    readonly version: string | undefined;
    readonly screen: number;
    readonly rows: readonly TextRow[];
  }>();
  const lastRows =
    lastScreen?.size === size &&
    lastScreen?.version === version &&
    lastScreen?.screen === screen
      ? lastScreen?.rows
      : undefined;
  const lastTop = useMemo(() => {
    if (lastRows === undefined) {
      return undefined;
    }
    const ending = screenRows(lastRows, wrapAt, encoding, counting);
    return ending[Math.max(0, ending.length - screen)]?.start ?? 0;
  }, [lastRows, wrapAt, encoding, screen, counting]);
  const ends = useMemo(
    () =>
      new RowRequests<{ readonly version: string | undefined }>((request) =>
        post({
          type: 'readRows',
          tab,
          encoding,
          request,
          anchor: size ?? 0,
          exact: true,
          before: screen,
          after: 0,
          least,
        }),
      ),
    [post, tab, encoding, size, screen, least],
  );
  useEffect(
    () =>
      listen((message) => {
        if (message.type !== 'rows' || message.tab !== tab) {
          return;
        }
        const asked = ends.answered(message.request);
        if (asked !== undefined) {
          setLastScreen({
            size,
            version: asked.version,
            screen,
            rows: message.rows,
          });
        }
      }),
    [listen, tab, ends, size, screen],
  );
  useEffect(() => {
    if (size !== undefined && measured !== undefined) {
      ends.restart();
      ends.ask({ version });
    }
  }, [ends, size, version, measured]);
  const [estimate, setEstimate] = useState<{
    readonly size: number | undefined;
    readonly screen: number;
    readonly wrapAt: number | undefined;
    readonly perRow: number;
  }>();
  const perRow = bytesPerRow(loaded.rows);
  if (
    perRow !== undefined &&
    (estimate === undefined ||
      estimate.size !== size ||
      estimate.screen !== screen ||
      estimate.wrapAt !== wrapAt)
  ) {
    setEstimate({ size, screen, wrapAt, perRow });
  }

  const requests = useMemo(
    () =>
      new RowRequests<Ask>((request, wanted) =>
        post({
          type: 'readRows',
          tab,
          encoding,
          request,
          anchor: wanted.anchor,
          exact: wanted.exact,
          before: wanted.before,
          after: wanted.after,
          least,
        }),
      ),
    [post, tab, encoding, least],
  );

  const placing = useRef<Placing>(undefined);
  const askPlace = useCallback(
    (ask: Ask) => {
      placing.current = { ask, by: 0 };
      requests.ask(ask);
    },
    [requests],
  );

  const move = useCallback(
    (by: number) => {
      const shown = current.current;
      const from = shown.rows[shown.top];
      if (from === undefined || by === 0) {
        return;
      }
      const unanswered = placing.current;
      if (unanswered !== undefined) {
        unanswered.by += by;
        return;
      }
      const within = scrolled(shown, by, screen, size ?? 0);
      if (within === undefined) {
        const reach = Math.max(screen, maxRowsAsked - screen * 3);
        const step = Math.max(-reach, Math.min(reach, by));
        askPlace({
          anchor: from.row.start,
          exact: true,
          before: Math.min(maxRowsAsked, Math.max(0, -step) + screen * 2),
          after: Math.min(maxRowsAsked, Math.max(0, step) + screen * 3),
          topOf: (first, arrived) =>
            topWithin(
              rowWithChar(arrived, first, from.from) + step,
              arrived.length,
              screen,
            ),
        });
        if (placing.current !== undefined) {
          placing.current.by += by - step;
        }
        return;
      }
      current.current = { ...shown, top: within.top };
      const top = shown.rows[within.top];
      setRead({ rows: shown.read, top: placeOf(top) });
      if (within.refill && top !== undefined) {
        requests.ask({
          anchor: top.row.start,
          exact: true,
          before: screen * 2,
          after: screen * 3,
          follow: true,
          refill: true,
          topOf: (first, arrived) =>
            topWithin(
              rowWithChar(arrived, first, top.from),
              arrived.length,
              screen,
            ),
        });
      }
    },
    [requests, askPlace, screen, size],
  );

  useEffect(
    () =>
      listen((message) => {
        if (message.tab !== tab || message.type !== 'rows') {
          return;
        }
        const pending = requests.answered(message.request);
        if (pending === undefined) {
          return;
        }
        const arrived = screenRows(message.rows, wrapAt, encoding, counting);
        const before = current.current.rows[current.current.top];
        const index = pending.follow
          ? message.rows.findIndex((row) => row.start === before?.row.start)
          : -1;
        if (pending.refill === true && index === -1) {
          return;
        }
        const top =
          index === -1 || before === undefined
            ? pending.topOf(firstOf(arrived, message.anchorIndex), arrived)
            : topWithin(
                rowWithChar(arrived, firstOf(arrived, index), before.from),
                arrived.length,
                screen,
              );
        setRead({ rows: message.rows, top: placeOf(arrived[top]) });
        const placed = placing.current;
        if (placed?.ask === pending) {
          placing.current = undefined;
          current.current = { read: message.rows, rows: arrived, top };
          move(placed.by);
        }
      }),
    [listen, tab, screen, requests, wrapAt, encoding, counting, move],
  );

  const jump = useCallback(
    (share: number) => {
      const anchor = Math.round(
        share *
          lastScreenStart(size ?? 0, screen, estimate?.perRow ?? 1, lastTop),
      );
      askPlace({
        anchor,
        exact: false,
        before: screen,
        after: screen + 1,
        topOf: (first, arrived) =>
          topWithin(
            rowWithByte(arrived, first, anchor),
            arrived.length,
            screen,
          ),
      });
    },
    [askPlace, screen, size, estimate?.perRow, lastTop],
  );

  useEffect(() => {
    if (viewing.size === undefined || measured === undefined) {
      return;
    }
    const from = current.current.rows[current.current.top];
    const placed = place.current;
    requests.restart();
    placing.current = undefined;
    requests.ask({
      anchor: from?.row.start ?? placed,
      exact: from !== undefined,
      before: screen * 2,
      after: screen * 3,
      follow: true,
      topOf: (first, arrived) =>
        topWithin(
          from === undefined
            ? rowWithByte(arrived, first, placed)
            : rowWithChar(arrived, first, from.from),
          arrived.length,
          screen,
        ),
    });
  }, [requests, viewing, screen, measured, place]);

  const goToMatch = useEffectEvent(() => {
    const target = find?.current;
    if (target === undefined) {
      return;
    }
    const { rows: shownRows, top } = current.current;
    const onScreen = shownRows
      .slice(top, top + screen)
      .some((row) => target.start >= row.start && target.start < row.end);
    if (!onScreen) {
      askPlace({
        anchor: target.start,
        exact: false,
        before: screen * 2,
        after: screen * 3,
        topOf: (first, arrived) =>
          topWithin(
            rowWithByte(arrived, first, target.start) - rowsAboveMatch,
            arrived.length,
            screen,
          ),
      });
    }
  });
  const jumps = find?.jump ?? 0;
  useEffect(() => {
    if (jumps > 0) {
      goToMatch();
    }
  }, [jumps]);

  const whole = wrapAt === undefined;
  const text = useWholeText(viewing, language !== undefined || whole, encoding);
  const colored = useColors(language, encoding, text);
  const shown = loaded.rows.slice(loaded.top, loaded.top + screen + 1);
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
  const [across, setAcross] = useState(0);
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
      : textMarks(matched.row, find.query, find.matches, target, encoding).find(
          (mark) => mark.current,
        )?.start;

  return (
    <ScrollBody
      numbered
      barPinned={finding}
      matches={find?.matches}
      size={size}
      thumb={textThumb(loaded, screen, size ?? 0, estimate?.perRow, lastTop)}
      onScreen={setMeasured}
      onColumns={setColumns}
      onFont={onFont}
      move={move}
      jump={jump}
      error={viewing.error}
      width={whole && wide.key === widthKey ? wide.columns : undefined}
      wrapped={!whole}
      onSideways={onSideways}
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
          <div
            className="viewer-row"
            key={`${row.row.start}:${row.from}`}
            data-key={`${row.row.start}:${row.from}`}
            data-continues={
              row.to < row.row.text.length || row.row.cut === true
                ? ''
                : undefined
            }
            style={
              (parts[index]?.column ?? 0) > 0
                ? {
                    paddingInlineStart: `calc(${parts[index]?.column ?? 0} * var(--commander-advance))`,
                  }
                : undefined
            }
          >
            <RowText
              shown={row}
              from={parts[index]?.from ?? row.from}
              to={parts[index]?.to ?? row.to}
              colored={colored}
              marks={
                find === undefined
                  ? []
                  : textMarks(
                      row.row,
                      find.query,
                      find.matches,
                      find.current,
                      encoding,
                    )
              }
              blanks={showWhitespace}
              widths={widths}
            />
            {!showWhitespace &&
              blankRuns(row.hanging).map(
                ({ column, columns: run, tab: isTab }) => {
                  const left = `calc(${column} * var(--commander-advance))`;
                  return isTab ? (
                    <span
                      key={column}
                      className="viewer-wrap-blank"
                      data-glyph={strings.symbols.tab}
                      style={{ left }}
                    />
                  ) : (
                    <span
                      key={column}
                      className="viewer-wrap-spaces"
                      style={{
                        left,
                        width: `calc(${run} * var(--commander-advance))`,
                      }}
                    />
                  );
                },
              )}
            {row.breakAt !== undefined && (
              <span
                className="viewer-break"
                data-glyph={strings.symbols.breaks}
                style={{
                  left: `calc(${row.breakAt} * var(--commander-advance))`,
                }}
              />
            )}
          </div>
        ))}
    </ScrollBody>
  );
}
