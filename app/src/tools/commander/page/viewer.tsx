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
  type CommanderToWebviewOf,
  type TextRow,
} from '../shared/protocol';
import { listMoveOf } from '../../../ui/listMoves';
import { RowRequests } from './rowRequests';
import { coloredText, rowSegments, type ColoredText } from './textColors';
import { colorCode } from '../../../ui/syntax';
import { languageOf } from '../../../ui/languages';
import { followDrag } from '../../../ui/followDrag';
import {
  hideAfter,
  overlayScrollbarClass,
} from '../../../ui/overlayScrollbars';

export interface Viewing {
  readonly tab: string;
  readonly size: number | undefined;
  readonly error?: string;
}

export type ToViewer = CommanderToWebviewOf<'rows' | 'text'>;

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

const minThumb = 24;

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

export function thumbOf(
  loaded: Loaded,
  screen: number,
  size: number,
  track: number,
): { readonly top: number; readonly height: number } {
  const first = loaded.rows[loaded.top];
  const last =
    loaded.rows[Math.min(loaded.rows.length, loaded.top + screen) - 1];
  if (first === undefined || last === undefined || size <= 0) {
    return { top: 0, height: track };
  }
  const height = Math.min(
    track,
    Math.max(minThumb, (track * (last.end - first.start)) / size),
  );
  return {
    top:
      ((track - height) * first.start) /
      Math.max(1, size - (last.end - first.start)),
    height,
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

export function Viewer({
  file,
  viewing,
  post,
  listen,
}: {
  file: string;
  viewing: Viewing | undefined;
  post: (message: CommanderToHost) => void;
  listen: (handler: (message: ToViewer) => void) => () => void;
}) {
  const body = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<Loaded>({ rows: [], top: 0 });
  const [screen, setScreen] = useState(1);
  const [track, setTrack] = useState(0);
  const wheel = useRef(0);
  const [barShown, setBarShown] = useState(false);
  const [heldAt, setHeldAt] = useState<number>();
  const dragging = heldAt !== undefined;
  const hiding = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showBar = useCallback(() => {
    clearTimeout(hiding.current);
    setBarShown(true);
    hiding.current = setTimeout(() => setBarShown(false), hideAfter);
  }, []);
  useEffect(() => () => clearTimeout(hiding.current), []);
  const current = useRef(loaded);
  useLayoutEffect(() => {
    current.current = loaded;
  });
  const tab = viewing?.tab;
  const size = viewing?.size;

  const requests = useMemo(
    () =>
      new RowRequests<Ask>((request, wanted) => {
        if (tab !== undefined) {
          post({
            type: 'readRows',
            tab,
            request,
            anchor: wanted.anchor,
            exact: wanted.exact,
            before: wanted.before,
            after: wanted.after,
          });
        }
      }),
    [post, tab],
  );
  const ask = useCallback(
    (wanted: Ask) => {
      if (tab !== undefined) {
        requests.ask(wanted);
      }
    },
    [requests, tab],
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

  useEffect(() => body.current?.focus(), []);

  useEffect(() => {
    const element = body.current;
    const row = probe.current;
    if (!element || !row) {
      return undefined;
    }
    const measure = () => {
      const height = row.getBoundingClientRect().height || 1;
      setScreen(Math.max(1, Math.floor(element.clientHeight / height)));
      setTrack(element.clientHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const move = useCallback(
    (by: number) => {
      const { rows, top } = current.current;
      const from = rows[top];
      if (from === undefined || by === 0) {
        return;
      }
      showBar();
      const within = scrolled(current.current, by, screen, size ?? 0);
      if (within === undefined) {
        ask({
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
        ask({
          anchor: shown.start,
          exact: true,
          before: screen * 2,
          after: screen * 3,
          follow: true,
          topOf: (anchorIndex, count) => topWithin(anchorIndex, count, screen),
        });
      }
    },
    [ask, screen, showBar, size],
  );

  const jump = useCallback(
    (anchor: number) =>
      ask({
        anchor,
        exact: false,
        before: screen * 2,
        after: screen * 3,
        topOf: (anchorIndex, count) => topWithin(anchorIndex, count, screen),
      }),
    [ask, screen],
  );

  useEffect(() => {
    if (viewing?.size === undefined) {
      return;
    }
    const from = current.current.rows[current.current.top];
    requests.restart();
    ask({
      anchor: from?.start ?? 0,
      exact: from !== undefined,
      before: screen * 2,
      after: screen * 3,
      follow: true,
      topOf: (anchorIndex, count) => topWithin(anchorIndex, count, screen),
    });
  }, [ask, requests, viewing, screen]);

  const language = languageOf(file);
  const [colored, setColored] = useState<ColoredText>();
  const textAsked = useRef(0);
  useEffect(() => {
    if (
      tab === undefined ||
      language === undefined ||
      viewing?.size === undefined ||
      viewing.size > maxColoredBytes
    ) {
      return undefined;
    }
    const request = ++textAsked.current;
    const leaving = new AbortController();
    const stop = listen((message) => {
      if (
        message.type !== 'text' ||
        message.tab !== tab ||
        message.request !== request ||
        message.text === undefined
      ) {
        return;
      }
      const { text } = message;
      void colorCode(language, text, leaving.signal).then((ranges) => {
        if (ranges !== undefined && !leaving.signal.aborted) {
          setColored(coloredText(text, ranges));
        }
      });
    });
    post({ type: 'readText', tab, request });
    return () => {
      leaving.abort();
      stop();
    };
  }, [tab, language, viewing, listen, post]);

  const thumb = thumbOf(loaded, screen, size ?? 0, track);
  const shown = loaded.rows.slice(loaded.top, loaded.top + screen + 1);

  return (
    <section className="column viewer">
      <header className="column-title">
        <span className="column-name">{file}</span>
      </header>
      <div
        className="column-body viewer-body"
        ref={body}
        tabIndex={0}
        data-column-focus=""
        onPointerMove={showBar}
        onWheel={(event) => {
          wheel.current += event.deltaY;
          const height = probe.current?.getBoundingClientRect().height ?? 1;
          const rows = Math.trunc(wheel.current / height);
          if (rows !== 0) {
            wheel.current -= rows * height;
            move(rows);
          }
        }}
        onKeyDown={(event) => {
          const step = listMoveOf(event);
          if (step === undefined) {
            return;
          }
          event.preventDefault();
          switch (step) {
            case 'up':
              move(-1);
              return;
            case 'down':
              move(1);
              return;
            case 'pageUp':
              move(-Math.max(1, screen - 1));
              return;
            case 'pageDown':
              move(Math.max(1, screen - 1));
              return;
            case 'first':
              jump(0);
              return;
            case 'last':
              jump(size ?? 0);
              return;
            default:
              step satisfies never;
          }
        }}
      >
        <div className="viewer-row commander-viewer-probe" ref={probe} />
        {viewing?.error === undefined ? (
          <div className="viewer-rows">
            {shown.map((row) => (
              <div className="viewer-row" key={row.start}>
                <RowText row={row} colored={colored} />
              </div>
            ))}
          </div>
        ) : (
          <div className="viewer-error">{viewing.error}</div>
        )}
        {size !== undefined && size > 0 && (
          <div
            className="viewer-scrollbar"
            onPointerDown={(event) => {
              event.preventDefault();
              const box = event.currentTarget.getBoundingClientRect();
              const at = (clientY: number) => {
                const share =
                  Math.min(Math.max(clientY - box.top, 0), box.height) /
                  Math.max(1, box.height);
                setHeldAt(share);
                jump(Math.round(share * size));
              };
              at(event.clientY);
              followDrag(
                window,
                (moved: PointerEvent) => at(moved.clientY),
                () => {
                  setHeldAt(undefined);
                  showBar();
                },
              );
            }}
          >
            <div
              className={`${overlayScrollbarClass} viewer-thumb${barShown || dragging ? ' shown' : ''}${dragging ? ' dragging' : ''}`}
              style={{
                top:
                  heldAt === undefined
                    ? thumb.top
                    : heldAt * (track - thumb.height),
                height: thumb.height,
              }}
            />
          </div>
        )}
      </div>
    </section>
  );
}
