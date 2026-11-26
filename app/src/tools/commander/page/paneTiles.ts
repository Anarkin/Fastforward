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
import { type Entry } from '../shared/protocol';
import { type Side } from '../shared/sides';
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
  scrollKey: string,
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
  const ruler = () =>
    body.current?.parentElement?.querySelector(
      '.commander-tile.commander-ruler',
    );
  const tileTextRow = () =>
    ruler()?.querySelector('.commander-tile-name')?.getBoundingClientRect()
      .height || estimatedRowHeight;
  const shownList = tiled
    ? fitting !== undefined
      ? `tiles ${thumbnailSize}`
      : undefined
    : 'details';
  const [fill, setFill] = useState<{
    readonly key: string;
    readonly from: number;
  }>();
  const fillFrom = fill?.key === scrollKey ? fill.from : undefined;
  const fillTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(fillTimer.current), []);
  const fillAt = (offset: number) => {
    const height = ruler()?.getBoundingClientRect().height ?? 0;
    if (offset === 0 || height > 0) {
      setFill({
        key: scrollKey,
        from: height > 0 ? Math.floor(offset / height + 0.01) * across : 0,
      });
    }
  };
  useLayoutEffect(() => {
    if (tiled && shownList !== undefined && fillFrom === undefined) {
      fillAt(actions.scrollOf(scrollKey));
    }
  });
  const fillScrolledTo = (offset: number) => {
    if (!tiled) {
      return;
    }
    clearTimeout(fillTimer.current);
    fillTimer.current = setTimeout(() => fillAt(offset), fillDelay);
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
      fillItems.findIndex((item) => item.index >= (fillFrom ?? 0)),
    ),
    thumbnailSize,
    tiled && shownList !== undefined && fillFrom !== undefined,
    (item, made, pixelRatio) =>
      void actions.saveThumbnail(item.source, thumbnailSize, pixelRatio, made),
  );
  const tileRows = useMemo(() => tileRowsOf(rows, across), [rows, across]);
  return { tiled, across, shownList, tileTextRow, fillScrolledTo, tileRows };
}
