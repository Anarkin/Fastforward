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
  type CommanderToHost,
  type TextEncoding,
  type TextRow,
} from '../shared/protocol';
import { RowRequests } from './rowRequests';
import {
  coloredText,
  rowSegments,
  withPart,
  type ColoredText,
} from './textColors';
import { colorer } from '../../../ui/syntax';
import { languageOf } from '../../../ui/languages';
import { ScrollBody, type Thumb } from './scrollBody';
import type { ToViewer, Viewing } from './viewer';
import type { ViewerFind } from './viewerFind';
import { MarkedText, textMarks, type FindMark } from './findMarks';
import {
  firstOf,
  marksWithin,
  piecesWithin,
  rowWithByte,
  rowWithChar,
  screenRows,
  type ScreenRow,
} from './screenRows';
import { useTextView } from '../../../ui/textView';
import { strings } from '../../../shared/strings';

const rowsAboveMatch = 2;

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
  colored,
  marks,
  blanks,
}: {
  shown: ScreenRow;
  colored: ColoredText | undefined;
  marks: readonly FindMark[];
  blanks: boolean;
}) {
  const { row, from, to } = shown;
  const pieces = (colored && rowSegments(colored, row)) ?? [{ text: row.text }];
  return (
    <MarkedText
      pieces={piecesWithin(pieces, from, to)}
      marks={marksWithin(marks, from, to)}
      blanks={blanks}
    />
  );
}

export function useWholeText(
  viewing: Viewing,
  post: (message: CommanderToHost) => void,
  listen: (handler: (message: ToViewer) => void) => () => void,
  wanted: boolean,
  encoding: TextEncoding,
): string | undefined {
  const [text, setText] = useState<string>();
  const asked = useRef(0);
  useEffect(() => {
    const { tab, size } = viewing;
    if (!wanted || size === undefined || size > maxColoredBytes) {
      return undefined;
    }
    const request = ++asked.current;
    const stop = listen((message) => {
      if (
        message.type === 'text' &&
        message.tab === tab &&
        message.request === request &&
        message.text !== undefined
      ) {
        setText(message.text);
      }
    });
    post({ type: 'readText', tab, encoding, request });
    return stop;
  }, [wanted, viewing, listen, post, encoding]);
  return text;
}

function useColors(
  file: string,
  encoding: TextEncoding,
  viewing: Viewing,
  post: (message: CommanderToHost) => void,
  listen: (handler: (message: ToViewer) => void) => () => void,
): ColoredText | undefined {
  const language = encoding === 'utf-8' ? languageOf(file) : undefined;
  const text = useWholeText(
    viewing,
    post,
    listen,
    language !== undefined,
    encoding,
  );
  const [colored, setColored] = useState<ColoredText>();
  useEffect(() => {
    if (language === undefined || text === undefined) {
      return undefined;
    }
    const plain = coloredText(text);
    return colorer().colorParts(language, text, (part) => {
      if (part !== undefined) {
        setColored((shown) =>
          withPart(shown?.lines === plain.lines ? shown : plain, part),
        );
      }
    });
  }, [language, text]);
  return colored;
}

export function TextBody({
  file,
  encoding,
  viewing,
  find,
  place,
  onPlace,
  post,
  listen,
}: {
  file: string;
  encoding: TextEncoding;
  viewing: Viewing;
  find?: ViewerFind;
  place: React.RefObject<number>;
  onPlace: (byte: number) => void;
  post: (message: CommanderToHost) => void;
  listen: (handler: (message: ToViewer) => void) => () => void;
}) {
  const [read, setRead] = useState<Read>({
    rows: [],
    top: { index: 0, from: 0 },
  });
  const [screen, setScreen] = useState(1);
  const [columns, setColumns] = useState<number>();
  const { wordWrap, showWhitespace } = useTextView().view;
  const wrapAt =
    wordWrap && columns !== undefined && columns > 1 ? columns - 1 : undefined;
  const rows = useMemo(
    () => screenRows(read.rows, wrapAt, encoding),
    [read.rows, wrapAt, encoding],
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
  const { tab, size } = viewing;
  const [lastScreen, setLastScreen] = useState<{
    readonly size: number | undefined;
    readonly screen: number;
    readonly rows: readonly TextRow[];
  }>();
  const lastRows =
    lastScreen?.size === size && lastScreen?.screen === screen
      ? lastScreen?.rows
      : undefined;
  const lastTop = useMemo(() => {
    if (lastRows === undefined) {
      return undefined;
    }
    const ending = screenRows(lastRows, wrapAt, encoding);
    return ending[Math.max(0, ending.length - screen)]?.start ?? 0;
  }, [lastRows, wrapAt, encoding, screen]);
  const ends = useMemo(
    () =>
      new RowRequests<true>((request) =>
        post({
          type: 'readRows',
          tab,
          encoding,
          request,
          anchor: size ?? 0,
          exact: true,
          before: screen,
          after: 0,
        }),
      ),
    [post, tab, encoding, size, screen],
  );
  useEffect(
    () =>
      listen((message) => {
        if (
          message.type === 'rows' &&
          message.tab === tab &&
          ends.answered(message.request) !== undefined
        ) {
          setLastScreen({ size, screen, rows: message.rows });
        }
      }),
    [listen, tab, ends, size, screen],
  );
  useEffect(() => {
    if (size !== undefined) {
      ends.ask(true);
    }
  }, [ends, size]);
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
        }),
      ),
    [post, tab, encoding],
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
        const arrived = screenRows(message.rows, wrapAt, encoding);
        const before = current.current.rows[current.current.top];
        const index = pending.follow
          ? message.rows.findIndex((row) => row.start === before?.row.start)
          : -1;
        const top =
          index === -1 || before === undefined
            ? pending.topOf(firstOf(arrived, message.anchorIndex), arrived)
            : topWithin(
                rowWithChar(arrived, firstOf(arrived, index), before.from),
                arrived.length,
                screen,
              );
        setRead({ rows: message.rows, top: placeOf(arrived[top]) });
      }),
    [listen, tab, screen, requests, wrapAt, encoding],
  );

  const move = useCallback(
    (by: number) => {
      const shown = current.current;
      const from = shown.rows[shown.top];
      if (from === undefined || by === 0) {
        return;
      }
      const within = scrolled(shown, by, screen, size ?? 0);
      if (within === undefined) {
        requests.ask({
          anchor: from.row.start,
          exact: true,
          before: Math.max(0, -by) + screen * 2,
          after: Math.max(0, by) + screen * 3,
          topOf: (first, arrived) =>
            topWithin(
              rowWithChar(arrived, first, from.from) + by,
              arrived.length,
              screen,
            ),
        });
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
          topOf: (first, arrived) =>
            topWithin(
              rowWithChar(arrived, first, top.from),
              arrived.length,
              screen,
            ),
        });
      }
    },
    [requests, screen, size],
  );

  const jump = useCallback(
    (share: number) => {
      const anchor = Math.round(
        share *
          lastScreenStart(size ?? 0, screen, estimate?.perRow ?? 1, lastTop),
      );
      requests.ask({
        anchor,
        exact: false,
        before: screen * 2,
        after: screen * 3,
        topOf: (first, arrived) =>
          topWithin(
            rowWithByte(arrived, first, anchor),
            arrived.length,
            screen,
          ),
      });
    },
    [requests, screen, size, estimate?.perRow, lastTop],
  );

  useEffect(() => {
    if (viewing.size === undefined) {
      return;
    }
    const from = current.current.rows[current.current.top];
    const placed = place.current;
    requests.restart();
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
  }, [requests, viewing, screen, place]);

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
      requests.ask({
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

  const colored = useColors(file, encoding, viewing, post, listen);
  const shown = loaded.rows.slice(loaded.top, loaded.top + screen + 1);

  return (
    <ScrollBody
      thumb={textThumb(loaded, screen, size ?? 0, estimate?.perRow, lastTop)}
      onScreen={setScreen}
      onColumns={setColumns}
      move={move}
      jump={jump}
      error={viewing.error}
    >
      {shown.map((row) => (
        <div
          className="viewer-row"
          key={`${row.row.start}:${row.from}`}
          data-continues={
            row.to < row.row.text.length || row.row.cut === true
              ? ''
              : undefined
          }
          style={
            row.indent > 0
              ? {
                  paddingInlineStart: `calc(${row.indent} * var(--commander-advance))`,
                }
              : undefined
          }
        >
          <RowText
            shown={row}
            colored={colored}
            marks={
              find === undefined
                ? []
                : textMarks(row.row, find.query, find.matches, find.current)
            }
            blanks={showWhitespace}
          />
          {!showWhitespace &&
            row.hanging.map(({ column, tab: isTab }) => (
              <span
                key={column}
                className="viewer-wrap-blank"
                data-glyph={isTab ? strings.symbols.tab : strings.symbols.space}
                style={{ left: `calc(${column} * var(--commander-advance))` }}
              />
            ))}
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
