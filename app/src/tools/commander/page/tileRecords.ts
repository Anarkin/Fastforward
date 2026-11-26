import { cssOf, packedOf } from '../../../components/cells/page/cellColors';
import type {
  ListView,
  RowRecord,
} from '../../../components/cells/page/listCanvas';
import {
  ellipsis,
  fitted,
  putRun,
  type RowPaint,
} from '../../../components/cells/page/runText';
import type { FindRange } from '../../../lib/shared/textMatches';
import type { LinePointed } from './lineRecords';
import type { PaneLooks } from './paneLooks';
import type { TileCheck, TileLooks } from './tileProbes';
import type { TileLook } from './tileLooks';

export interface TilePicture {
  readonly image: HTMLImageElement | ImageBitmap;
  readonly key: string;
  readonly width: number;
  readonly height: number;
}

export interface SeenTile {
  readonly index: number;
  readonly key: string;
  readonly name: string;
  readonly drawn: string;
  readonly size: string;
  readonly date: string;
  readonly classes: readonly string[];
  readonly picture: 'thumbnail' | 'system' | 'generic' | 'none';
  readonly pictureUrl: string | undefined;
  readonly pictureWidth: number;
  readonly pictureHeight: number;
  readonly picturePixels: number;
  readonly check: 'none' | 'empty' | 'checked';
  readonly found: readonly string[];
  readonly ground: string;
  readonly ink: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly checkLeft: number;
  readonly checkTop: number;
  readonly checkSize: number;
}

export interface TileRecord extends RowRecord {
  readonly seen: readonly Omit<SeenTile, 'top'>[];
}

export interface ShownTile {
  readonly look: TileLook;
  readonly index: number;
  readonly picture: TilePicture | undefined;
  readonly pictureKind: SeenTile['picture'];
}

const tickPath = 'M4.5 8.2 7 10.7l4.5-5';

const tickBox = 16;

const layoutUnits = 64;

const laidOut = (device: number) =>
  Math.round(device * layoutUnits) / layoutUnits;

function shownRanges(
  ranges: readonly FindRange[],
  shown: string,
): readonly FindRange[] {
  const length = shown.endsWith(ellipsis)
    ? shown.length - ellipsis.length
    : shown.length;
  return ranges.flatMap((range) =>
    range.start < length
      ? [{ start: range.start, end: Math.min(range.end, length) }]
      : [],
  );
}

export function tileRowRecordOf({
  tiles,
  top,
  pointed,
  looks,
  tileLooks,
  view,
  sign,
}: {
  readonly tiles: readonly ShownTile[];
  readonly top: number;
  readonly pointed: LinePointed | undefined;
  readonly looks: PaneLooks;
  readonly tileLooks: TileLooks;
  readonly view: ListView;
  readonly sign: string;
}): TileRecord {
  const { runs, scale, pixelWidth } = view;
  const paint: RowPaint = { rects: [], tiles: [] };
  const topPixels = Math.round(top * scale);
  const heightPixels = Math.round((top + tileLooks.height) * scale) - topPixels;
  paint.rects.push(
    0,
    topPixels,
    pixelWidth,
    heightPixels,
    packedOf(looks.ground),
  );
  const fontScale = scale / looks.textScale;
  const font = `${looks.font.weight} ${looks.font.size * fontScale}px ${looks.font.family}`;
  const spacing = looks.spacing * fontScale;
  const seen: Omit<SeenTile, 'top'>[] = [];
  tiles.forEach(({ look, index, picture, pictureKind }, column) => {
    const left = column * tileLooks.width;
    const leftPixels = Math.round(left * scale);
    const widthPixels =
      Math.round((left + tileLooks.width) * scale) - leftPixels;
    const isPointed = pointed?.index === index;
    const inks = tileLooks.inksOf(
      look.classes,
      isPointed,
      isPointed && pointed.overCheck,
    );
    const { ground } = inks;
    const groundCss = cssOf(ground);
    paint.rects.push(
      leftPixels,
      topPixels,
      widthPixels,
      heightPixels,
      packedOf(ground),
    );
    const tileAt = (
      x: number,
      width: number,
      key: string,
      draw: (context: OffscreenCanvasRenderingContext2D) => void,
    ) => {
      const tile = runs.painted(`${key}|${groundCss}`, width, groundCss, draw);
      if (tile !== undefined) {
        paint.tiles.push(
          x,
          topPixels,
          tile.u,
          tile.v,
          tile.width,
          runs.tileHeight,
          packedOf(ground),
        );
      }
    };
    if (picture !== undefined) {
      const box = tileLooks.thumbnail;
      const across = Math.min(picture.width, box.width);
      const down = Math.min(picture.height, box.height);
      const x = left + box.left + (box.width - across) / 2;
      const y = box.top + (box.height - down) / 2;
      const xPixels = Math.round(x * scale);
      const widthOf = Math.round((x + across) * scale) - xPixels;
      const yPixels = Math.round(y * scale);
      const heightOf = Math.round((y + down) * scale) - yPixels;
      tileAt(
        xPixels,
        widthOf,
        `picture|${picture.key}|${widthOf}|${heightOf}|${yPixels}|${inks.thumbnailOpacity}`,
        (context) => {
          context.globalAlpha = inks.thumbnailOpacity;
          context.imageSmoothingQuality = 'high';
          context.drawImage(picture.image, 0, yPixels, widthOf, heightOf);
        },
      );
    }
    const { check } = inks;
    if (check !== undefined && !look.up) {
      const box = tileLooks.check;
      const x = Math.round((left + box.left) * scale);
      const size = Math.round((left + box.left + box.width) * scale) - x;
      const y = Math.round(box.top * scale);
      const ring = Math.max(1, Math.round(looks.hairline * scale));
      tileAt(
        x - ring,
        size + 2 * ring,
        `tile-check|${size}|${y}|${ring}|${checkKey(check)}`,
        (context) => drawCheck(context, check, size, y, ring, scale),
      );
    }
    const runLook = {
      ink: inks.ink,
      ground,
      markInk: looks.markInk,
      markGround: looks.markGround,
      markTop: looks.markTop,
      markHeight: looks.markHeight,
    };
    const found: string[] = [];
    const room = tileLooks.width - 2 * tileLooks.padding;
    const measured = (text: string) =>
      text === '' ? 0 : runs.measure(text, font, spacing) / scale;
    const put = (
      text: string,
      x: number,
      lineTop: number,
      ink: string,
      ranges: readonly FindRange[],
    ) => {
      if (text === '') {
        return;
      }
      const marks = shownRanges(ranges, text);
      found.push(...marks.map((range) => text.slice(range.start, range.end)));
      putRun(paint, runs, scale, top, runLook, {
        text,
        font,
        x: (laidOut(x * scale) + view.shiftX) / scale,
        baseline: lineTop + tileLooks.baseline,
        inks: [{ start: 0, end: text.length, ink }],
        marks,
        spacing,
      });
    };
    const extensionWidth = measured(look.extension);
    const cut = measured(look.base) + extensionWidth > room;
    const base = !cut
      ? look.base
      : fitted(
          runs,
          look.base,
          font,
          Math.max(0, room - extensionWidth) * scale,
          spacing,
        );
    const nameInk = look.up
      ? inks.ink
      : tileLooks.nameInkOf(look.classes, look.nameClass, look.nameColor);
    const baseWidth = cut ? Math.max(0, room - extensionWidth) : measured(base);
    const nameLeft =
      left + tileLooks.padding + (room - baseWidth - extensionWidth) / 2;
    put(base, nameLeft, tileLooks.nameTop, nameInk, look.baseFound);
    put(
      look.extension,
      nameLeft + baseWidth,
      tileLooks.nameTop,
      nameInk,
      look.extensionFound,
    );
    const centered = (text: string, lineTop: number, ink: string) =>
      put(
        text,
        left + tileLooks.padding + (room - measured(text)) / 2,
        lineTop,
        ink,
        [],
      );
    centered(
      look.size,
      tileLooks.sizeTop,
      look.counting ? inks.counting : inks.ink,
    );
    centered(look.date, tileLooks.dateTop, inks.ink);
    seen.push({
      index,
      key: look.key,
      name: `${look.base}${look.extension}`,
      drawn: `${base}${look.extension}`,
      size: look.size,
      date: look.date,
      classes: [...look.classes.split(' '), ...(isPointed ? ['pointed'] : [])],
      picture: pictureKind,
      pictureUrl: picture?.key,
      pictureWidth: picture?.width ?? 0,
      pictureHeight: picture?.height ?? 0,
      picturePixels: picture === undefined ? 0 : pixelWidthOf(picture.image),
      check:
        check === undefined || look.up
          ? 'none'
          : check.tick === undefined
            ? 'empty'
            : 'checked',
      found,
      ground: groundCss,
      ink: inks.ink,
      left,
      width: tileLooks.width,
      height: tileLooks.height,
      checkLeft: tileLooks.check.left,
      checkTop: tileLooks.check.top,
      checkSize: tileLooks.check.width,
    });
  });
  return { sign, ...paint, seen };
}

const pixelWidthOf = (image: HTMLImageElement | ImageBitmap): number =>
  'naturalWidth' in image ? image.naturalWidth : image.width;

function checkKey(check: TileCheck): string {
  return [check.ring, check.edge, check.fill, check.tick ?? []]
    .map((color) => color.join(','))
    .join('|');
}

function drawCheck(
  context: OffscreenCanvasRenderingContext2D,
  check: TileCheck,
  size: number,
  top: number,
  ring: number,
  scale: number,
): void {
  context.fillStyle = cssOf(check.ring);
  context.fillRect(0, top - ring, size + 2 * ring, size + 2 * ring);
  const edge = Math.max(1, Math.floor(scale + 1e-6));
  context.fillStyle = cssOf(check.edge);
  context.fillRect(ring, top, size, size);
  context.fillStyle = cssOf(check.fill);
  context.fillRect(ring + edge, top + edge, size - 2 * edge, size - 2 * edge);
  if (check.tick === undefined) {
    return;
  }
  context.save();
  context.translate(ring, top);
  context.scale(size / tickBox, size / tickBox);
  context.lineWidth = 2;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = cssOf(check.tick);
  context.stroke(new Path2D(tickPath));
  context.restore();
}
