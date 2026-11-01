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
import { coloredText, rowSegments, type ColoredText } from './textColors';
import { colorCode } from '../../../ui/syntax';
import { languageOf } from '../../../ui/languages';
import { ScrollBody, type Thumb } from './scrollBody';
import type { ToViewer, Viewing } from './viewer';
import type { ViewerFind } from './viewerFind';
import { MarkedText, textMarks, type FindMark } from './findMarks';

const rowsAboveMatch = 2;

interface Loaded {
  readonly rows: readonly TextRow[];
  readonly top: number;
}

interface Ask {
  readonly anchor: number;
  readonly exact: boolean;
  readonly before: number;
  readonly after: number;
  readonly topOf: (anchorIndex: number, count: number) => number;
  readonly follow?: boolean;
}

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

export function bytesPerRow(rows: readonly TextRow[]): number | undefined {
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
  row,
  colored,
  marks,
}: {
  row: TextRow;
  colored: ColoredText | undefined;
  marks: readonly FindMark[];
}) {
  return (
    <MarkedText
      pieces={(colored && rowSegments(colored, row)) ?? [{ text: row.text }]}
      marks={marks}
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
    const leaving = new AbortController();
    void colorCode(language, text, leaving.signal).then((ranges) => {
      if (ranges !== undefined && !leaving.signal.aborted) {
        setColored(coloredText(text, ranges));
      }
    });
    return () => leaving.abort();
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
  const [loaded, setLoaded] = useState<Loaded>({ rows: [], top: 0 });
  const [screen, setScreen] = useState(1);
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
    readonly start: number;
  }>();
  const lastTop =
    lastScreen?.size === size && lastScreen?.screen === screen
      ? lastScreen?.start
      : undefined;
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
          setLastScreen({ size, screen, start: message.rows[0]?.start ?? 0 });
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
    readonly perRow: number;
  }>();
  const perRow = bytesPerRow(loaded.rows);
  if (
    perRow !== undefined &&
    (estimate === undefined ||
      estimate.size !== size ||
      estimate.screen !== screen)
  ) {
    setEstimate({ size, screen, perRow });
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
      listen((rows) => {
        if (rows.tab !== tab || rows.type !== 'rows') {
          return;
        }
        const pending = requests.answered(rows.request);
        if (pending === undefined) {
          return;
        }
        const shownStart = current.current.rows[current.current.top]?.start;
        const shown = pending.follow
          ? rows.rows.findIndex((row) => row.start === shownStart)
          : -1;
        setLoaded({
          rows: rows.rows,
          top:
            shown === -1
              ? pending.topOf(rows.anchorIndex, rows.rows.length)
              : topWithin(shown, rows.rows.length, screen),
        });
      }),
    [listen, tab, screen, requests],
  );

  const move = useCallback(
    (by: number) => {
      const { rows, top } = current.current;
      const from = rows[top];
      if (from === undefined || by === 0) {
        return;
      }
      const within = scrolled(current.current, by, screen, size ?? 0);
      if (within === undefined) {
        requests.ask({
          anchor: from.start,
          exact: true,
          before: Math.max(0, -by) + screen * 2,
          after: Math.max(0, by) + screen * 3,
          topOf: (anchorIndex, count) =>
            topWithin(anchorIndex + by, count, screen),
        });
        return;
      }
      const moved = { ...current.current, top: within.top };
      current.current = moved;
      setLoaded(moved);
      const shown = rows[within.top];
      if (within.refill && shown !== undefined) {
        requests.ask({
          anchor: shown.start,
          exact: true,
          before: screen * 2,
          after: screen * 3,
          follow: true,
          topOf: (anchorIndex, count) => topWithin(anchorIndex, count, screen),
        });
      }
    },
    [requests, screen, size],
  );

  const jump = useCallback(
    (share: number) =>
      requests.ask({
        anchor: Math.round(
          share *
            lastScreenStart(size ?? 0, screen, estimate?.perRow ?? 1, lastTop),
        ),
        exact: false,
        before: screen * 2,
        after: screen * 3,
        topOf: (anchorIndex, count) => topWithin(anchorIndex, count, screen),
      }),
    [requests, screen, size, estimate?.perRow, lastTop],
  );

  useEffect(() => {
    if (viewing.size === undefined) {
      return;
    }
    const from = current.current.rows[current.current.top];
    requests.restart();
    requests.ask({
      anchor: from?.start ?? place.current,
      exact: from !== undefined,
      before: screen * 2,
      after: screen * 3,
      follow: true,
      topOf: (anchorIndex, count) => topWithin(anchorIndex, count, screen),
    });
  }, [requests, viewing, screen, place]);

  const goToMatch = useEffectEvent(() => {
    const target = find?.current;
    if (target === undefined) {
      return;
    }
    const { rows, top } = current.current;
    const onScreen = rows
      .slice(top, top + screen)
      .some((row) => target.start >= row.start && target.start < row.end);
    if (!onScreen) {
      requests.ask({
        anchor: target.start,
        exact: false,
        before: screen * 2,
        after: screen * 3,
        topOf: (anchorIndex, count) =>
          topWithin(anchorIndex - rowsAboveMatch, count, screen),
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
      move={move}
      jump={jump}
      error={viewing.error}
    >
      {shown.map((row) => (
        <div className="viewer-row" key={row.start}>
          <RowText
            row={row}
            colored={colored}
            marks={
              find === undefined
                ? []
                : textMarks(row, find.query, find.matches, find.current)
            }
          />
        </div>
      ))}
    </ScrollBody>
  );
}
