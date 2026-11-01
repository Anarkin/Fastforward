import { useCallback, useEffect, useMemo, useState } from 'react';
import { maxBytesAsked, type CommanderToHost } from '../shared/protocol';
import { RowRequests } from './rowRequests';
import { ScrollBody } from './scrollBody';
import {
  byteText,
  bytesToAsk,
  hexRow,
  hexRowBytes,
  offsetDigits,
  type LoadedBytes,
} from './hex';
import type { ToViewer, Viewing } from './viewer';

interface Bytes {
  readonly start: number;
  readonly data: readonly number[];
}

export type ByteLayout = 'hex' | 'text';

const minTextColumns = 16;

export function ByteBody({
  layout,
  viewing,
  post,
  listen,
}: {
  layout: ByteLayout;
  viewing: Viewing;
  post: (message: CommanderToHost) => void;
  listen: (handler: (message: ToViewer) => void) => () => void;
}) {
  const { tab } = viewing;
  const size = viewing.size ?? 0;
  const [screen, setScreen] = useState(1);
  const [columns, setColumns] = useState(minTextColumns);
  const [topByte, setTopByte] = useState(0);
  const [bytes, setBytes] = useState<Bytes>();
  const rowBytes =
    layout === 'hex' ? hexRowBytes : Math.max(minTextColumns, columns);
  const rowCount = Math.ceil(size / rowBytes);
  const lastTop = Math.max(0, rowCount - screen);
  const top = Math.min(Math.floor(topByte / rowBytes), lastTop);

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
        if (
          message.type === 'bytes' &&
          message.tab === tab &&
          requests.answered(message.request) !== undefined
        ) {
          setBytes({ start: message.start, data: message.data });
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
      size,
      bytes && { start: bytes.start, length: bytes.data.length },
      rowBytes,
    );
    if (wanted !== undefined) {
      requests.ask(
        wanted.length > maxBytesAsked
          ? { start: top * rowBytes, length: maxBytesAsked }
          : wanted,
      );
    }
  }, [requests, top, screen, size, bytes, rowBytes]);

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
              {data && byteText(data)}
            </div>
          );
        }
        const row = hexRow(offset, data ?? [], digits);
        return (
          <div className="viewer-row hex-row" key={offset}>
            <span className="hex-offset">{row.offset}</span>
            {data && <span className="hex-bytes">{row.hex}</span>}
            {data && <span className="hex-text">{row.text}</span>}
          </div>
        );
      })}
    </ScrollBody>
  );
}
