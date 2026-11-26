import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { watchDevicePixels } from '../../../lib/page/devicePixels';
import {
  gpuGeneration,
  watchGpu,
} from '../../../components/cells/page/gpuDevice';
import {
  drawnWithRoom,
  ListCanvas,
  type Presented,
  type ShownRow,
} from '../../../components/cells/page/listCanvas';
import type { RowsDrawn } from '../../../lib/page/virtualRows';
import { cssOf } from '../../../components/cells/page/cellColors';
import { ToolIcon } from '../../../lib/page/icons';
import type { IconSource } from '../shared/icons';
import { iconUrl } from '../shared/icons';
import type { LineLook } from './lineLooks';
import { paneLooksOf, type PaneLooks } from './paneLooks';
import type { PaneIcons } from './paneIcons';
import { lineRecordOf, type LineRecord, type SeenLine } from './lineRecords';
import { useImages } from './paneImages';
import type { LineSight } from './lineSight';
import { signOf } from './rowLooks';
import { tileLooksOf, type TileLooks } from './tileProbes';
import {
  tileRowRecordOf,
  type SeenTile,
  type ShownTile,
  type TileRecord,
} from './tileRecords';
import { tilePicturesOf, type TileMode } from './tilePictures';
import { darkNow, watchScheme } from '../../../lib/page/colorScheme';

declare global {
  interface HTMLElement {
    seenLines?: (() => readonly SeenLine[]) | undefined;
    seenInks?: ((classes: string) => SeenInks) | undefined;
    seenTiles?: (() => readonly SeenTile[]) | undefined;
  }
}

interface SeenInks {
  readonly ground: string;
  readonly ink: string;
  readonly iconOpacity: number;
}

const isTileRow = (row: LineRecord | TileRecord): row is TileRecord =>
  Array.isArray(row.seen);

export function PaneCanvas({
  list,
  drawn,
  lineOf,
  sourceOf,
  line,
  lookKey,
  icons,
  sight,
  tiles,
}: {
  list: React.RefObject<HTMLElement | null>;
  drawn: RowsDrawn;
  lineOf: (index: number) => LineLook | undefined;
  tiles?: TileMode | undefined;
  sourceOf: (index: number) => IconSource | undefined;
  line: number;
  lookKey: string;
  icons: PaneIcons;
  sight: LineSight;
}) {
  const [scale, setScale] = useState(() => window.devicePixelRatio);
  useEffect(
    () => watchDevicePixels(() => setScale(window.devicePixelRatio)),
    [],
  );
  const host = useRef<HTMLDivElement>(null);
  const git = useRef<HTMLSpanElement>(null);
  const kept = useRef<ListCanvas<LineRecord | TileRecord>>(undefined);
  const read = useRef<{ key: string; looks: PaneLooks }>(undefined);
  const readTiles = useRef<{ key: string; looks: TileLooks }>(undefined);
  const generation = useSyncExternalStore(watchGpu, gpuGeneration);
  const dark = useSyncExternalStore(watchScheme, darkNow);
  const images = useImages(sight);

  useEffect(
    () => () => {
      kept.current?.dispose();
      kept.current = undefined;
      read.current?.looks.dispose();
      read.current = undefined;
      readTiles.current?.looks.dispose();
      readTiles.current = undefined;
    },
    [],
  );

  useEffect(() => {
    const element = list.current;
    if (element === null) {
      return undefined;
    }
    const onScroll = () => sight.redraw();
    element.addEventListener('scroll', onScroll);
    return () => element.removeEventListener('scroll', onScroll);
  }, [list, sight]);

  useLayoutEffect(() => {
    const frame = (): Presented | undefined => {
      const element = host.current;
      const listed = list.current;
      const spacer = element?.parentElement;
      if (
        element === null ||
        listed === null ||
        spacer === null ||
        spacer === undefined
      ) {
        return undefined;
      }
      kept.current ??= new ListCanvas<LineRecord | TileRecord>(
        'commander-canvas',
      );
      const canvas = kept.current;
      const view = canvas.viewOf(
        element,
        listed,
        scale,
        Math.round(line * scale),
      );
      if (view === undefined) {
        return undefined;
      }
      const { cells, width, origin, viewHeight, pixelWidth } = view;
      const looksKey = [dark, scale, line, generation, lookKey, width].join(
        ' ',
      );
      if (read.current?.key !== looksKey) {
        read.current?.looks.dispose();
        read.current = {
          key: looksKey,
          looks: paneLooksOf(spacer, width, scale, git.current),
        };
      }
      const { looks } = read.current;
      element.seenInks = (classes) => {
        const inks = looks.inksOf(classes, false, false);
        return {
          ground: cssOf(inks.ground),
          ink: inks.ink,
          iconOpacity: inks.iconOpacity,
        };
      };
      sight.place({
        gitLeft: looks.gitLeft,
        gitSize: looks.gitSize,
        size: { ...looks.size, top: 0, height: looks.height },
      });
      cells.grounded(looks.ground);
      view.runs.textScale = looks.textScale;
      const cache = canvas.rowsFor(looksKey, images.generation);
      const hover = sight.pointed;
      const urls = new Set<string>();
      if (tiles !== undefined) {
        const tilesKey = [looksKey, tiles.tileWidth, tiles.thumbnailSize].join(
          ' ',
        );
        if (readTiles.current?.key !== tilesKey) {
          readTiles.current?.looks.dispose();
          readTiles.current = {
            key: tilesKey,
            looks: tileLooksOf(
              spacer,
              looks,
              tiles.tileWidth,
              tiles.thumbnailSize,
            ),
          };
        }
        const tileLooks = readTiles.current.looks;
        sight.place({
          gitLeft: 0,
          gitSize: 0,
          size: {
            left: tileLooks.padding,
            top: tileLooks.sizeTop,
            width: tileLooks.width - 2 * tileLooks.padding,
            height: looks.height,
          },
        });
        const pictures = tilePicturesOf({
          tiles,
          icons,
          images,
          sourceOf,
          tileLooks,
          scale,
          iconUrls: urls,
        });
        const shownTiles: (ShownRow<TileRecord> & { top: number })[] = [];
        const firstRow = Math.max(0, Math.floor(origin / line));
        const lastRow = Math.min(
          drawn.count - 1,
          Math.floor((origin + viewHeight) / line),
        );
        for (let gridRow = firstRow; gridRow <= lastRow; gridRow++) {
          const place = drawn.placeOf(gridRow);
          if (place === undefined) {
            continue;
          }
          const inRow: ShownTile[] = [];
          const from = gridRow * tiles.across;
          const to = Math.min(tiles.count, from + tiles.across);
          for (let index = from; index < to; index++) {
            const look = tiles.tileOf(index);
            if (look !== undefined) {
              inRow.push({ look, index, ...pictures.of(look, index) });
            }
          }
          const here =
            hover !== undefined && hover.index >= from && hover.index < to
              ? hover
              : undefined;
          const sign = JSON.stringify([
            inRow.map(({ look, picture, pictureKind }) => [
              signOf(look),
              picture?.key,
              picture?.width,
              picture?.height,
              pictureKind,
            ]),
            place.top,
            here?.index,
            here?.overCheck,
          ]);
          const key = `tiles ${gridRow}`;
          const before = cache.get(key);
          const row =
            before !== undefined && before.sign === sign && isTileRow(before)
              ? before
              : tileRowRecordOf({
                  tiles: inRow,
                  top: place.top,
                  pointed: here,
                  looks,
                  tileLooks,
                  view,
                  sign,
                });
          cache.set(key, row);
          for (const tile of row.seen) {
            sight.inked(tile.index, tile.ink);
          }
          shownTiles.push({ row, top: place.top - origin, pinned: false });
        }
        icons.keep(urls);
        tiles.thumbnails.keep(pictures.thumbnailKeys);
        images.keep(pictures.decoded);
        const presented = canvas.present(
          view,
          shownTiles,
          [tilesKey, origin, viewHeight, pixelWidth].join(' '),
          () => cells.clipped(0, 0),
        );
        if (presented !== 'drawn') {
          return presented;
        }
        element.seenTiles = () => {
          const box = listed.getBoundingClientRect();
          const left = box.left + listed.clientLeft;
          const top = box.top + listed.clientTop;
          return shownTiles.flatMap((each) =>
            each.row.seen.map((tile) => ({
              ...tile,
              left: left + tile.left,
              top: top + each.top,
            })),
          );
        };
        element.seenLines = undefined;
        return presented;
      }
      element.seenTiles = undefined;
      images.keep(new Set());
      const shown: (ShownRow<LineRecord> & { top: number })[] = [];
      const first = Math.max(0, Math.floor(origin / line));
      const last = Math.min(
        drawn.count - 1,
        Math.floor((origin + viewHeight) / line),
      );
      for (let index = first; index <= last; index++) {
        const look = lineOf(index);
        const place = drawn.placeOf(index);
        if (look === undefined || place === undefined) {
          continue;
        }
        const source = sourceOf(index);
        const icon = source === undefined ? undefined : icons.shown(source);
        const iconKey = source === undefined ? undefined : iconUrl(source);
        if (iconKey !== undefined) {
          urls.add(iconKey);
        }
        const here = hover?.index === index ? hover : undefined;
        const sign = `${signOf(look)} ${place.top} ${here === undefined ? '' : here.overCheck ? 'check' : 'pointed'} ${icon === undefined ? 0 : icon === 'failed' ? 1 : 2} ${iconKey ?? ''}`;
        const before = cache.get(look.key);
        const row =
          before !== undefined && before.sign === sign && !isTileRow(before)
            ? before
            : lineRecordOf({
                look,
                index,
                top: place.top,
                pointed: here,
                icon,
                iconKey,
                looks,
                view,
                images,
                sign,
              });
        cache.set(look.key, row);
        sight.inked(index, row.seen.ink);
        shown.push({ row, top: place.top - origin, pinned: false });
      }
      icons.keep(urls);
      const presented = canvas.present(
        view,
        shown,
        [looksKey, origin, viewHeight, pixelWidth].join(' '),
        () => cells.clipped(0, 0),
      );
      if (presented !== 'drawn') {
        return presented;
      }
      element.seenLines = () => {
        const box = listed.getBoundingClientRect();
        const left = box.left + listed.clientLeft;
        const top = box.top + listed.clientTop;
        return shown.map((each) => ({
          ...each.row.seen,
          width,
          height: line,
          left,
          top: top + each.top,
        }));
      };
      return presented;
    };
    const draw = () => drawnWithRoom(frame);
    sight.drawWith(draw);
    draw();
    return () => sight.stopDrawing(draw);
  });

  return (
    <div ref={host} className="commander-layer" aria-hidden="true">
      <span ref={git} className="commander-probe">
        <ToolIcon tool="git" />
      </span>
    </div>
  );
}
