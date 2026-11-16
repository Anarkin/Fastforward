import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useEffectEvent,
} from 'react';
import { RowRequests } from './rowRequests';
import type { ViewerFind } from './viewerFind';
import { byteMarks, hexMarks } from './markPieces';
import { MarkedText } from './findMarks';

const rowsAboveMatch = 2;
import { ScrollBody } from './scrollBody';
import {
  byteText,
  bytesToAsk,
  hexRow,
  hexRowBytes,
  offsetDigits,
  type LoadedBytes,
} from './hex';
import type { Viewing } from './viewing';
import { useViewerActions } from './store';
import type { KeptBytes } from './viewerKept';

type Bytes = KeptBytes;

export type ByteLayout = 'hex' | 'text';

const minTextColumns = 16;

export function ByteBody({
  layout,
  viewing,
  find,
  finding = false,
  place,
  onPlace,
}: {
  layout: ByteLayout;
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
  const { tab, version } = viewing;
  const size = viewing.size ?? 0;
  const [screen, setScreen] = useState(1);
  const [columns, setColumns] = useState(minTextColumns);
  const [topByte, setTopByte] = useState(() => place.current);
  const body = layout === 'hex' ? 'hex' : 'bytes';
  const [keptLeft] = useState(() => {
    const kept = keptViewer(tab).sideways;
    return kept?.body === body ? kept.left : undefined;
  });
  const onLeft = useCallback(
    (left: number) => keepViewer(tab, { sideways: { body, left, column: 0 } }),
    [keepViewer, tab, body],
  );
  const [bytes, setBytes] = useState<Bytes | undefined>(() => {
    const kept = keptViewer(tab).bytes;
    return kept?.version === version ? kept : undefined;
  });
  useEffect(() => {
    if (bytes !== undefined) {
      keepViewer(tab, { bytes });
    }
  }, [keepViewer, tab, bytes]);
  const rowBytes =
    layout === 'hex' ? hexRowBytes : Math.max(minTextColumns, columns);
  const rowCount = Math.ceil(size / rowBytes);
  const lastTop = Math.max(0, rowCount - screen);
  const top = Math.min(Math.floor(topByte / rowBytes), lastTop);
  useEffect(() => onPlace(top * rowBytes), [top, rowBytes, onPlace]);

  const requests = useMemo(
    () =>
      new RowRequests<LoadedBytes & { readonly version: string | undefined }>(
        (request, { start, length }) =>
          post({ type: 'readBytes', tab, request, start, length }),
      ),
    [post, tab],
  );

  useEffect(
    () =>
      listen((message) => {
        if (message.type !== 'bytes' || message.tab !== tab) {
          return;
        }
        const asked = requests.answered(message.request);
        if (asked !== undefined) {
          setBytes({
            version: asked.version,
            start: message.start,
            data: message.data,
            asked: asked.length,
          });
        }
      }),
    [listen, tab, requests],
  );

  useEffect(() => {
    if (viewing.size !== undefined) {
      requests.restart();
      setBytes((shown) =>
        shown?.version === viewing.version ? shown : undefined,
      );
    }
  }, [requests, viewing]);

  useEffect(() => {
    const wanted = bytesToAsk(
      top,
      screen,
      viewing.size ?? 0,
      bytes && {
        start: bytes.start,
        length: Math.max(bytes.data.length, bytes.asked),
      },
      rowBytes,
    );
    if (wanted !== undefined) {
      requests.ask({ ...wanted, version: viewing.version });
    }
  }, [requests, top, screen, viewing, bytes, rowBytes]);

  const move = useCallback(
    (by: number) =>
      setTopByte(
        (byte) =>
          Math.max(0, Math.min(Math.floor(byte / rowBytes) + by, lastTop)) *
          rowBytes,
      ),
    [lastTop, rowBytes],
  );
  const jump = useCallback(
    (share: number) => setTopByte(Math.round(share * lastTop) * rowBytes),
    [lastTop, rowBytes],
  );

  const goToMatch = useEffectEvent(() => {
    const target = find?.current;
    if (target === undefined) {
      return;
    }
    const row = Math.floor(target.start / rowBytes);
    if (row < top || row >= top + screen) {
      setTopByte(Math.max(0, row - rowsAboveMatch) * rowBytes);
    }
  });
  const jumps = find?.jump ?? 0;
  useEffect(() => {
    if (jumps > 0) {
      goToMatch();
    }
  }, [jumps]);
  const marksOf = (offset: number, length: number) =>
    find === undefined
      ? []
      : byteMarks(offset, length, find.matches, find.current);

  const digits = offsetDigits(size);
  const rows = Array.from(
    { length: Math.max(0, Math.min(rowCount - top, screen + 1)) },
    (_, index) => {
      const offset = (top + index) * rowBytes;
      const from = bytes === undefined ? -1 : offset - bytes.start;
      const held =
        bytes !== undefined &&
        from >= 0 &&
        from + Math.min(rowBytes, size - offset) <= bytes.data.length;
      return {
        offset,
        data: held ? bytes.data.slice(from, from + rowBytes) : undefined,
      };
    },
  );

  return (
    <ScrollBody
      barPinned={finding}
      matches={find?.matches}
      size={size}
      thumb={
        rowCount === 0
          ? undefined
          : {
              start: lastTop === 0 ? 0 : top / lastTop,
              length: Math.min(1, screen / rowCount),
            }
      }
      onScreen={setScreen}
      onColumns={setColumns}
      move={move}
      jump={jump}
      error={viewing.error}
      keptLeft={keptLeft}
      settled={bytes !== undefined}
      onLeft={onLeft}
    >
      {rows.map(({ offset, data }) => {
        if (layout === 'text') {
          return (
            <div className="viewer-row" key={offset}>
              {data && (
                <MarkedText
                  pieces={[{ text: byteText(data) }]}
                  marks={marksOf(offset, data.length)}
                />
              )}
            </div>
          );
        }
        const row = hexRow(offset, data ?? [], digits);
        return (
          <div className="viewer-row hex-row" key={offset}>
            <span className="hex-offset">{row.offset}</span>
            {data && (
              <span className="hex-bytes">
                <MarkedText
                  pieces={[{ text: row.hex }]}
                  marks={hexMarks(marksOf(offset, data.length))}
                />
              </span>
            )}
            {data && (
              <span className="hex-text">
                <MarkedText
                  pieces={[{ text: row.text }]}
                  marks={marksOf(offset, data.length)}
                />
              </span>
            )}
          </div>
        );
      })}
    </ScrollBody>
  );
}
