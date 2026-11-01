import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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

export function textThumb(
  loaded: Loaded,
  screen: number,
  size: number,
): Thumb | undefined {
  const first = loaded.rows[loaded.top];
  const last =
    loaded.rows[Math.min(loaded.rows.length, loaded.top + screen) - 1];
  if (first === undefined || last === undefined || size <= 0) {
    return undefined;
  }
  const shown = last.end - first.start;
  return {
    start: size > shown ? Math.min(1, first.start / (size - shown)) : 0,
    length: Math.min(1, shown / size),
  };
}

function RowText({
  row,
  colored,
}: {
  row: TextRow;
  colored: ColoredText | undefined;
}) {
  const segments = colored && rowSegments(colored, row);
  if (segments === undefined) {
    return <>{row.text}</>;
  }
  return (
    <>
      {segments.map(({ text, kind }, index) =>
        kind === undefined ? (
          text
        ) : (
          <span key={index} className={`syntax-${kind}`}>
            {text}
          </span>
        ),
      )}
    </>
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
  place,
  onPlace,
  post,
  listen,
}: {
  file: string;
  encoding: TextEncoding;
  viewing: Viewing;
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
      const moved = { rows, top: within.top };
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
        anchor: Math.round(share * (size ?? 0)),
        exact: false,
        before: screen * 2,
        after: screen * 3,
        topOf: (anchorIndex, count) => topWithin(anchorIndex, count, screen),
      }),
    [requests, screen, size],
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

  const colored = useColors(file, encoding, viewing, post, listen);
  const shown = loaded.rows.slice(loaded.top, loaded.top + screen + 1);

  return (
    <ScrollBody
      thumb={textThumb(loaded, screen, size ?? 0)}
      onScreen={setScreen}
      move={move}
      jump={jump}
      error={viewing.error}
    >
      {shown.map((row) => (
        <div className="viewer-row" key={row.start}>
          <RowText row={row} colored={colored} />
        </div>
      ))}
    </ScrollBody>
  );
}
