import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CommanderToHost } from '../shared/protocol';
import { RowRequests } from './rowRequests';
import { ScrollBody } from './scrollBody';
import {
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

export function HexBody({
  viewing,
  post,
  listen,
}: {
  viewing: Viewing;
  post: (message: CommanderToHost) => void;
  listen: (handler: (message: ToViewer) => void) => () => void;
}) {
  const { tab } = viewing;
  const size = viewing.size ?? 0;
  const [screen, setScreen] = useState(1);
  const [topRow, setTopRow] = useState(0);
  const [bytes, setBytes] = useState<Bytes>();
  const rowCount = Math.ceil(size / hexRowBytes);
  const lastTop = Math.max(0, rowCount - screen);
  const top = Math.min(topRow, lastTop);

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
    );
    if (wanted !== undefined) {
      requests.ask(wanted);
    }
  }, [requests, top, screen, size, bytes]);

  const move = useCallback(
    (by: number) =>
      setTopRow((row) => Math.max(0, Math.min(row + by, lastTop))),
    [lastTop],
  );
  const jump = useCallback(
    (share: number) => setTopRow(Math.round(share * lastTop)),
    [lastTop],
  );

  const digits = offsetDigits(size);
  const rows = Array.from(
    { length: Math.max(0, Math.min(rowCount - top, screen + 1)) },
    (_, index) => {
      const offset = (top + index) * hexRowBytes;
      const from = bytes === undefined ? -1 : offset - bytes.start;
      const held =
        bytes !== undefined &&
        from >= 0 &&
        from + Math.min(hexRowBytes, size - offset) <= bytes.data.length;
      return {
        offset,
        row: hexRow(
          offset,
          held ? bytes.data.slice(from, from + hexRowBytes) : [],
          digits,
        ),
        held,
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
      move={move}
      jump={jump}
      error={viewing.error}
    >
      {rows.map(({ offset, row, held }) => (
        <div className="viewer-row hex-row" key={offset}>
          <span className="hex-offset">{row.offset}</span>
          {held && <span className="hex-bytes">{row.hex}</span>}
          {held && <span className="hex-text">{row.text}</span>}
        </div>
      ))}
    </ScrollBody>
  );
}
