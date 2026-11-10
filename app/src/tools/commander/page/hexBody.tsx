import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useEffectEvent,
} from 'react';
import { RowRequests } from './rowRequests';
import type { ViewerFind } from './viewerFind';
import { MarkedText, byteMarks, hexMarks } from './findMarks';

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
import type { Viewing } from './viewer';
import { useCommanderActions } from './store';

interface Bytes {
  readonly start: number;
  readonly data: readonly number[];
  readonly asked: number;
}

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
  const { request: post, listenViewer: listen } = useCommanderActions();
  const { tab } = viewing;
  const size = viewing.size ?? 0;
  const [screen, setScreen] = useState(1);
  const [columns, setColumns] = useState(minTextColumns);
  const [topByte, setTopByte] = useState(() => place.current);
  const [bytes, setBytes] = useState<Bytes>();
  const rowBytes =
    layout === 'hex' ? hexRowBytes : Math.max(minTextColumns, columns);
  const rowCount = Math.ceil(size / rowBytes);
  const lastTop = Math.max(0, rowCount - screen);
  const top = Math.min(Math.floor(topByte / rowBytes), lastTop);
  useEffect(() => onPlace(top * rowBytes), [top, rowBytes, onPlace]);

  const requests = useMemo(
    () =>
      new RowRequests<LoadedBytes>((request, { start, length }) =>
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
      setBytes(undefined);
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
      requests.ask(wanted);
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
