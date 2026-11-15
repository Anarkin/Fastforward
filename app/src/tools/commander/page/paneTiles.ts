import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { thumbnailUrl } from '../shared/thumbnails';
import type { IconSource } from '../shared/icons';
import {
  imageType,
  maxImageSize,
  vectorType,
} from '../../../lib/shared/images';
import { estimatedRowHeight } from '../../../lib/page/listRows';
import { useThumbnailFill, type FillItem } from './thumbnailFills';
import { type Entry, type Side } from '../shared/protocol';
import { type Row } from './listing';
import { tileColumns, tileWidthOf } from './tiles';
import { useCommander, useCommanderActions } from './store';

export function tileThumbnailUrl(source: IconSource, entry: Entry): string {
  return thumbnailUrl(source, `${entry.size ?? ''}:${entry.modified ?? ''}`);
}

const fillDelay = 250;

export type ThumbnailFill = FillItem & {
  readonly index: number;
  readonly source: IconSource;
};

function thumbnailFills(
  rows: readonly Row[],
  shown: { readonly tab: string; readonly side: Side; readonly folder: string },
): ThumbnailFill[] {
  return rows.flatMap((row, index): ThumbnailFill[] => {
    const type = imageType(row.key);
    if (
      row.entry === undefined ||
      row.entry.folder ||
      type === undefined ||
      type === vectorType ||
      (row.entry.size ?? 0) > maxImageSize
    ) {
      return [];
    }
    const source = { ...shown, name: row.key };
    return [
      {
        url: tileThumbnailUrl(source, row.entry),
        name: row.key,
        index,
        source,
      },
    ];
  });
}

function tileRowsOf(rows: readonly Row[], across: number) {
  return {
    count: Math.ceil(rows.length / across),
    keyOf: (index: number) => rows[index * across].key,
    indexOf: (key: string) => {
      const at = rows.findIndex((row) => row.key === key);
      return at === -1 ? -1 : Math.floor(at / across);
    },
  };
}

export function useTiles(
  body: React.RefObject<HTMLDivElement | null>,
  side: Side,
  rows: readonly Row[],
) {
  const tab = useCommander((state) => state.view.tab);
  const shownFolder = useCommander((state) => state.view.panes[side]?.folder);
  const layout = useCommander((state) => state.view.layouts[side]);
  const thumbnailSize = useCommander((state) => state.view.thumbnailSize);
  const actions = useCommanderActions();
  const tileWidth = tileWidthOf(thumbnailSize);
  const [fitting, setFitting] = useState<number>();
  useLayoutEffect(() => {
    const element = body.current;
    if (!element) {
      return undefined;
    }
    const measure = () =>
      setFitting(
        element.clientWidth > 0
          ? tileColumns(element.clientWidth, tileWidth)
          : undefined,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [body, tileWidth]);
  const across = fitting ?? 1;
  const tiled = layout === 'thumbnails';
  const tileTextRow = () =>
    body.current?.querySelector('.commander-tile-name')?.getBoundingClientRect()
      .height || estimatedRowHeight;
  const shownList = tiled
    ? fitting !== undefined
      ? `tiles ${thumbnailSize}`
      : undefined
    : 'details';
  const [fillFrom, setFillFrom] = useState(0);
  const fillTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(fillTimer.current), []);
  const fillScrolledTo = (offset: number) => {
    if (!tiled) {
      return;
    }
    clearTimeout(fillTimer.current);
    fillTimer.current = setTimeout(() => {
      const height =
        body.current?.querySelector('.virtual-row')?.getBoundingClientRect()
          .height ?? 0;
      setFillFrom(height > 0 ? Math.floor(offset / height + 0.01) * across : 0);
    }, fillDelay);
  };
  const fillItems = useMemo(
    () =>
      tiled && tab !== undefined && shownFolder !== undefined
        ? thumbnailFills(rows, { tab, side, folder: shownFolder })
        : [],
    [tiled, rows, tab, side, shownFolder],
  );
  useThumbnailFill(
    fillItems,
    Math.max(
      0,
      fillItems.findIndex((item) => item.index >= fillFrom),
    ),
    thumbnailSize,
    tiled && shownList !== undefined,
    (item, made, pixelRatio) =>
      void actions.saveThumbnail(item.source, thumbnailSize, pixelRatio, made),
  );
  const tileRows = useMemo(() => tileRowsOf(rows, across), [rows, across]);
  return { tiled, across, shownList, tileTextRow, fillScrolledTo, tileRows };
}
