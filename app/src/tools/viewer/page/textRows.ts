import { type ScreenRow } from '../../../components/cells/page/lines';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useEffectEvent,
} from 'react';
import { maxRowsAsked, type TextRow } from '../shared/protocol';
import { type TextEncoding } from '../../../components/encodings/shared/textEncodings';
import type { TextWidths } from '../../../lib/page/textWidths';
import type { ViewerActions } from './state';
import type { Viewing } from './viewing';
import { RowRequests } from './rowRequests';
import {
  firstOf,
  rowWithByte,
  rowWithChar,
  screenRows,
  partOfRow,
} from './screenRows';
import {
  topWithin,
  scrolled,
  jumpedWithin,
  draggedTo,
  bytesPerRow,
} from './textScroll';
import { lineScaleOf, rowsOfLine } from './lineScale';
import type { ViewerFind } from './find';
import { useViewer, useViewerActions } from './store';

export const rowsAboveMatch = 2;

interface Place {
  readonly index: number;
  readonly from: number;
}

interface Read {
  readonly rows: readonly TextRow[];
  readonly top: Place;
}

const noRead: Read = { rows: [], top: { index: 0, from: 0 } };

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

export function useTextRows({
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
}: {
  readonly post: ViewerActions['request'];
  readonly listen: ViewerActions['listenViewer'];
  readonly viewing: Viewing;
  readonly encoding: TextEncoding;
  readonly measured: number | undefined;
  readonly screen: number;
  readonly wrapAt: number | undefined;
  readonly counting: TextWidths;
  readonly least: number;
  readonly place: () => number;
  readonly onPlace: (byte: number) => void;
  readonly find: ViewerFind | undefined;
}) {
  const { tab, size, version } = viewing;
  const { keepViewer } = useViewerActions();
  const kept = useViewer((state) => state.caches.get(tab)?.rows);
  const read: Read =
    kept?.encoding === encoding && kept.version === version ? kept : noRead;
  const setRead = useCallback(
    (next: Read) =>
      keepViewer(tab, {
        rows: { encoding, version, ...next },
      }),
    [keepViewer, tab, encoding, version],
  );
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
  const [lineStarts, setLineStarts] = useState<{
    readonly encoding: TextEncoding;
    readonly version: string | undefined;
    readonly size: number;
    readonly starts: readonly number[] | undefined;
  }>();
  const linesAsked = useRef<{
    readonly request: number;
    readonly encoding: TextEncoding;
    readonly version: string | undefined;
  }>(undefined);
  useEffect(() => {
    if (size === undefined) {
      return;
    }
    const request = (linesAsked.current?.request ?? 0) + 1;
    linesAsked.current = { request, encoding, version };
    post({ type: 'readLineStarts', tab, encoding, request });
  }, [post, tab, encoding, size, version]);
  useEffect(
    () =>
      listen((message) => {
        const asked = linesAsked.current;
        if (
          message.type === 'lineStarts' &&
          message.tab === tab &&
          message.request === asked?.request
        ) {
          setLineStarts({
            encoding: asked.encoding,
            version: asked.version,
            size: message.size,
            starts: message.starts,
          });
        }
      }),
    [listen, tab],
  );
  const knownStarts =
    lineStarts?.encoding === encoding &&
    lineStarts.version === version &&
    lineStarts.size === size
      ? lineStarts.starts
      : undefined;
  const scale = useMemo(
    () =>
      knownStarts === undefined || size === undefined
        ? undefined
        : lineScaleOf(
            knownStarts,
            size,
            rowsOfLine(wrapAt, encoding.startsWith('utf-16') ? 2 : 1),
          ),
    [knownStarts, size, wrapAt, encoding],
  );
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

  const placeWithin = useCallback(
    (
      shown: Shown,
      within: { readonly top: number; readonly refill: boolean },
    ) => {
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
    [requests, screen, setRead],
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
      placeWithin(shown, within);
    },
    [askPlace, screen, size, placeWithin],
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
    [listen, tab, screen, requests, wrapAt, encoding, counting, move, setRead],
  );

  const jump = useCallback(
    (share: number, part?: (fraction: number) => void) => {
      const anchor = draggedTo(
        share,
        screen,
        size ?? 0,
        estimate?.perRow ?? 1,
        lastTop,
        scale,
      );
      const shown = current.current;
      const within = jumpedWithin(shown, anchor, screen, size ?? 0);
      if (within !== undefined) {
        if (placing.current !== undefined) {
          requests.restart();
          placing.current = undefined;
        }
        part?.(
          within.top === within.row
            ? partOfRow(shown.rows, within.row, anchor)
            : 0,
        );
        placeWithin(shown, within);
        return;
      }
      askPlace({
        anchor,
        exact: false,
        before: screen,
        after: screen + 1,
        topOf: (first, arrived) => {
          const row = rowWithByte(arrived, first, anchor);
          const top = topWithin(row, arrived.length, screen);
          part?.(top === row ? partOfRow(arrived, row, anchor) : 0);
          return top;
        },
      });
    },
    [
      requests,
      askPlace,
      placeWithin,
      screen,
      size,
      estimate?.perRow,
      lastTop,
      scale,
    ],
  );

  useEffect(() => {
    if (viewing.size === undefined || measured === undefined) {
      return;
    }
    const from = current.current.rows[current.current.top];
    const placed = place();
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
  return {
    rows,
    loaded,
    move,
    jump,
    perRow: estimate?.perRow,
    lastTop,
    scale,
  };
}
