import { useKeptSelection } from './tabSelection';
import type { FindMark } from '../../../components/cells/page/marks';
import type { ScreenRow, TextLine } from '../../../components/cells/page/lines';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useEffectEvent,
  useSyncExternalStore,
} from 'react';
import { RowRequests } from './rowRequests';
import type { ViewerFind } from './find';
import { byteMarks, hexLineMarks } from './markPieces';
import { useShell } from '../../../shell/page/store';
import { CellRows } from './cellRows';
import { useCellFont } from '../../../components/cells/page/cellFont';
import { gpuRefused, watchGpu } from '../../../components/cells/page/gpuDevice';
import type { RowAhead } from '../../../components/cells/page/glyphWarmth';
import { strings } from '../../../lib/shared/strings';

const rowsAboveMatch = 2;
import { ScrollBody } from './scrollBody';
import { rowEnds } from './scrollThumbs';
import {
  byteText,
  bytesToAsk,
  hexLine,
  hexRow,
  hexRowBytes,
  hexSegments,
  hexShape,
  offsetDigits,
  withBlankBytes,
  type LoadedBytes,
} from './hex';
import type { SegmentsOf } from '../../../components/cells/page/cellPainting';
import { bytesFound, hexBytes, selectedBytes } from './byteCopies';
import type { ByteRange } from '../shared/protocol';
import type { Viewing } from './viewing';
import { useViewer, useViewerActions } from './store';
import type { KeptBytes } from './tabParts';

type Bytes = KeptBytes;

export type ByteLayout = 'hex' | 'text';

const minTextColumns = 16;

const noRanges: readonly ByteRange[] = [];

interface SelectedBytes {
  readonly key: string;
  readonly bytes: readonly number[];
}

const noMarks: readonly FindMark[] = [];

const noRowsAhead: readonly RowAhead[] = [];

const noCopy = () => undefined;

export function ByteBody({
  layout,
  viewing,
  find,
  onPlace,
}: {
  layout: ByteLayout;
  viewing: Viewing;
  find?: ViewerFind;
  onPlace: (byte: number) => void;
}) {
  const {
    request: post,
    listenViewer: listen,
    keptViewer,
    keepViewer,
    placeOf,
    keepPlace,
  } = useViewerActions();
  const { tab, version } = viewing;
  const refused = useSyncExternalStore(watchGpu, gpuRefused);
  const size = viewing.size ?? 0;
  const [screen, setScreen] = useState(1);
  const [columns, setColumns] = useState(minTextColumns);
  const topByte = useViewer((state) => state.places.get(tab) ?? 0);
  const setTopByte = useCallback(
    (byte: number) => keepPlace(tab, byte),
    [keepPlace, tab],
  );
  const body = layout === 'hex' ? 'hex' : 'bytes';
  const keptSideways = keptViewer(tab).sideways;
  const keptLeft = keptSideways?.body === body ? keptSideways.left : undefined;
  const onLeft = useCallback(
    (left: number) => keepViewer(tab, { sideways: { body, left, column: 0 } }),
    [keepViewer, tab, body],
  );
  const keptBytes = useViewer((state) => state.caches.get(tab)?.bytes);
  const bytes = keptBytes?.version === version ? keptBytes : undefined;
  const setBytes = useCallback(
    (next: Bytes | undefined) => keepViewer(tab, { bytes: next }),
    [keepViewer, tab],
  );
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
    [listen, tab, requests, setBytes],
  );

  useEffect(() => {
    if (viewing.size !== undefined) {
      requests.restart();
      if (keptViewer(tab).bytes?.version !== viewing.version) {
        setBytes(undefined);
      }
    }
  }, [requests, viewing, tab, keptViewer, setBytes]);

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
        Math.max(
          0,
          Math.min(Math.floor(placeOf(tab) / rowBytes) + by, lastTop),
        ) * rowBytes,
      ),
    [lastTop, rowBytes, placeOf, tab, setTopByte],
  );
  const jump = useCallback(
    (share: number, part?: (fraction: number) => void) => {
      const row = share * lastTop;
      const whole = part ? Math.floor(row) : Math.round(row);
      setTopByte(whole * rowBytes);
      part?.(row - whole);
    },
    [lastTop, rowBytes, setTopByte],
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
  const finding = find !== undefined && find.query !== '';
  const highlightOccurrences = useShell(
    (state) => state.textView.highlightOccurrences,
  );
  const [copy, setCopy] = useState<string>();
  const { kept, onKept } = useKeptSelection(
    tab,
    `${layout} ${rowBytes}`,
    version,
  );
  const selection = kept?.selection;
  const selectedKey =
    selection === undefined ? undefined : JSON.stringify(selection);
  const [taken, setTaken] = useState<SelectedBytes>();
  useEffect(() => {
    if (selection === undefined || selectedKey === undefined) {
      setTaken(undefined);
      return;
    }
    if (bytes === undefined || taken?.key === selectedKey) {
      return;
    }
    const sought = selectedBytes(selection, bytes);
    if (sought.length > 0) {
      setTaken({ key: selectedKey, bytes: sought });
    }
  }, [selection, selectedKey, bytes, taken]);
  const copiedBytes = useMemo(() => {
    if (bytes === undefined || !highlightOccurrences || finding) {
      return noRanges;
    }
    const sought =
      layout === 'hex'
        ? copy === undefined
          ? []
          : hexBytes(copy)
        : taken?.key === selectedKey
          ? (taken?.bytes ?? [])
          : [];
    return bytesFound(bytes.start, bytes.data, sought);
  }, [layout, copy, taken, selectedKey, bytes, highlightOccurrences, finding]);
  const marksOf = (offset: number, length: number) =>
    find === undefined
      ? []
      : byteMarks(offset, length, find.matches, find.current);

  const digits = offsetDigits(size);
  const showWhitespace = useShell((state) => state.textView.showWhitespace);
  const segmentsOf = useMemo((): SegmentsOf | undefined => {
    const plain =
      layout === 'hex'
        ? (row: TextLine) => hexSegments(row.text, digits)
        : undefined;
    if (!showWhitespace || bytes === undefined) {
      return plain;
    }
    const textAt = layout === 'hex' ? hexLine(hexRow(0, [], digits)).textAt : 0;
    return (row) => {
      const from = row.start - bytes.start;
      return withBlankBytes(
        plain?.(row) ?? [{ text: row.text }],
        textAt,
        from < 0 ? [] : bytes.data.slice(from, from + rowBytes),
      );
    };
  }, [layout, digits, showWhitespace, bytes, rowBytes]);
  const { font, onFont, table, widths, dotLook } = useCellFont();
  const marks = new Map<number, readonly FindMark[]>();
  const copies = new Map<number, readonly FindMark[]>();
  const rowAt = (offset: number): ScreenRow => {
    const from = bytes === undefined ? -1 : offset - bytes.start;
    const data =
      bytes !== undefined &&
      from >= 0 &&
      from + Math.min(rowBytes, size - offset) <= bytes.data.length
        ? bytes.data.slice(from, from + rowBytes)
        : undefined;
    const found = data === undefined ? [] : marksOf(offset, data.length);
    const copied =
      data === undefined
        ? []
        : byteMarks(offset, data.length, copiedBytes, undefined).map(
            (mark): FindMark => ({ ...mark, occurrence: true }),
          );
    const line =
      layout === 'hex'
        ? hexLine(hexRow(offset, data ?? [], digits), data !== undefined)
        : undefined;
    const text = line?.text ?? (data === undefined ? '' : byteText(data));
    if (found.length > 0) {
      marks.set(
        offset,
        line === undefined
          ? found
          : hexLineMarks(found, line.bytesAt, line.textAt),
      );
    }
    if (copied.length > 0) {
      copies.set(
        offset,
        line === undefined
          ? copied
          : hexLineMarks(copied, line.bytesAt, line.textAt),
      );
    }
    const end = offset + rowBytes;
    return {
      start: offset,
      end,
      row: {
        start: offset,
        end,
        text,
        ...(layout === 'text' && { cut: true as const }),
      },
      index: 0,
      from: 0,
      to: text.length,
      indent: 0,
      breakAt: undefined,
      hanging: [],
    };
  };
  const rows: ScreenRow[] = Array.from(
    { length: Math.max(0, Math.min(rowCount - top, screen + 2)) },
    (_, index) => rowAt((top + index) * rowBytes),
  );
  const held: ScreenRow[] =
    bytes === undefined
      ? rows
      : Array.from(
          { length: Math.ceil(bytes.data.length / rowBytes) },
          (_, index) => {
            const offset = bytes.start + index * rowBytes;
            return rows.find((row) => row.start === offset) ?? rowAt(offset);
          },
        );

  return (
    <ScrollBody
      numbered={layout === 'text'}
      matches={find?.matches}
      size={size}
      thumb={
        lastTop === 0
          ? undefined
          : {
              start: lastTop === 0 ? 0 : top / lastTop,
              length: Math.min(1, screen / rowCount),
            }
      }
      ends={rowEnds(top, lastTop)}
      lead={top}
      onScreen={setScreen}
      onColumns={setColumns}
      onFont={onFont}
      move={move}
      jump={jump}
      error={viewing.error ?? (refused ? strings.common.noGpu : undefined)}
      keptLeft={keptLeft}
      settled={bytes !== undefined}
      onLeft={onLeft}
    >
      {table !== undefined && (
        <CellRows
          rows={rows}
          parts={rows.map(() => undefined)}
          wrapAt={undefined}
          colored={undefined}
          segmentsOf={segmentsOf}
          marksOf={(row) =>
            finding
              ? (marks.get(row.start) ?? noMarks)
              : (copies.get(row.start) ?? noMarks)
          }
          shape={layout === 'hex' ? hexShape : undefined}
          showWhitespace={false}
          widths={widths}
          font={font}
          dotLook={dotLook}
          ahead={noRowsAhead}
          held={held}
          text={undefined}
          onSelected={highlightOccurrences && !finding ? setCopy : noCopy}
          kept={kept}
          onKept={onKept}
          move={move}
          first={0}
          columns={Math.max(
            1,
            layout === 'hex'
              ? hexLine(hexRow(0, [], digits)).textAt + hexRowBytes
              : rowBytes,
          )}
        />
      )}
    </ScrollBody>
  );
}
