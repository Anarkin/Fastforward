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
  ListCanvas,
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
import type { TileLook } from './tileLooks';
import { tileLooksOf, type TileLooks } from './tileProbes';
import {
  tileRowRecordOf,
  type SeenTile,
  type ShownTile,
  type TilePicture,
  type TileRecord,
} from './tileRecords';
import { thumbnailKey, type TileThumbnails } from './tileThumbnails';

declare global {
  interface HTMLElement {
    seenLines?: (() => readonly SeenLine[]) | undefined;
    seenInks?: ((classes: string) => SeenInks) | undefined;
    seenTiles?: (() => readonly SeenTile[]) | undefined;
  }
}

export interface TileMode {
  readonly across: number;
  readonly tileWidth: number;
  readonly thumbnailSize: number;
  readonly count: number;
  readonly tileOf: (index: number) => TileLook | undefined;
  readonly thumbnailOf: (index: number) => string | undefined;
  readonly thumbnails: TileThumbnails;
  readonly made: (index: number, made: Blob, pixelRatio: number) => void;
}

interface SeenInks {
  readonly ground: string;
  readonly ink: string;
  readonly iconOpacity: number;
}

const darkScheme = '(prefers-color-scheme: dark)';

const watchScheme = (listener: () => void) => {
  const query = matchMedia(darkScheme);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
};

const darkNow = () => matchMedia(darkScheme).matches;

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
    const draw = () => {
      const element = host.current;
      const listed = list.current;
      const spacer = element?.parentElement;
      if (
        element === null ||
        listed === null ||
        spacer === null ||
        spacer === undefined
      ) {
        return;
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
        return;
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
        const thumbnailKeys = new Set<string>();
        const none: Pick<ShownTile, 'picture' | 'pictureKind'> = {
          picture: undefined,
          pictureKind: 'none',
        };
        const iconOf = (
          look: TileLook,
          index: number,
        ): Pick<ShownTile, 'picture' | 'pictureKind'> => {
          const source = sourceOf(index);
          if (source !== undefined) {
            urls.add(iconUrl(source));
            const system = icons.shown(source);
            if (system !== undefined && system !== 'failed') {
              return {
                picture: {
                  image: system,
                  key: iconUrl(source),
                  width: tileLooks.iconSize,
                  height: tileLooks.iconSize,
                },
                pictureKind: 'system',
              };
            }
          }
          const url = tileLooks.genericOf(look.folder);
          const image = images.get(url);
          return image === undefined || url === undefined
            ? none
            : {
                picture: {
                  image,
                  key: url,
                  width: tileLooks.genericSize,
                  height: tileLooks.genericSize,
                },
                pictureKind: 'generic',
              };
        };
        const pictureOf = (
          look: TileLook,
          index: number,
        ): Pick<ShownTile, 'picture' | 'pictureKind'> => {
          const url = tiles.thumbnailOf(index);
          if (look.image === 'raster' && url !== undefined) {
            thumbnailKeys.add(thumbnailKey(url, tiles.thumbnailSize, scale));
            const thumbnail = tiles.thumbnails.shown(
              url,
              tiles.thumbnailSize,
              scale,
              (made, pixelRatio) => tiles.made(index, made, pixelRatio),
            );
            if (thumbnail === null) {
              return iconOf(look, index);
            }
            if (thumbnail === undefined) {
              return none;
            }
            const image = images.get(thumbnail.url);
            return image === undefined
              ? none
              : {
                  picture: {
                    image,
                    key: thumbnail.url,
                    width: thumbnail.width,
                    height: thumbnail.height,
                  },
                  pictureKind: 'thumbnail',
                };
          }
          if (look.image === 'vector' && url !== undefined) {
            if (images.failed(url)) {
              return iconOf(look, index);
            }
            const image = images.get(url);
            if (image === undefined) {
              return none;
            }
            const fit = Math.min(
              1,
              tiles.thumbnailSize / (image.naturalWidth || 1),
              tiles.thumbnailSize / (image.naturalHeight || 1),
            );
            const picture: TilePicture = {
              image,
              key: url,
              width: image.naturalWidth * fit,
              height: image.naturalHeight * fit,
            };
            return { picture, pictureKind: 'thumbnail' };
          }
          return iconOf(look, index);
        };
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
              inRow.push({ look, index, ...pictureOf(look, index) });
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
        tiles.thumbnails.keep(thumbnailKeys);
        const presented = canvas.present(
          view,
          shownTiles,
          [tilesKey, origin, viewHeight, pixelWidth].join(' '),
          () => cells.clipped(0, 0),
        );
        if (presented === 'full') {
          draw();
          return;
        }
        if (presented === 'same') {
          return;
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
        return;
      }
      element.seenTiles = undefined;
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
        const sign = `${signOf(look)} ${place.top} ${here === undefined ? '' : here.overCheck ? 'check' : 'pointed'} ${icon === undefined ? 0 : icon === 'failed' ? 1 : 2}`;
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
      if (presented === 'full') {
        draw();
        return;
      }
      if (presented === 'same') {
        return;
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
    };
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
