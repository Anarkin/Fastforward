import {
  cssOf,
  filled,
  packedOf,
  type Rgba,
} from '../../../components/cells/page/cellColors';
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
import type { LineLook } from './lineLooks';
import type { CheckLook, PaneLooks } from './paneLooks';
import type { IconShown } from './paneIcons';
import type { PaneImages } from './paneImages';

export interface LinePointed {
  readonly index: number;
  readonly overCheck: boolean;
}

export interface SeenLine {
  readonly index: number;
  readonly key: string;
  readonly name: string;
  readonly drawn: string;
  readonly extension: string;
  readonly size: string;
  readonly date: string;
  readonly classes: readonly string[];
  readonly icon: 'system' | 'generic' | 'none';
  readonly check: 'none' | 'empty' | 'checked';
  readonly cut: readonly string[];
  readonly family: string;
  readonly ground: string;
  readonly ink: string;
  readonly iconOpacity: number;
  readonly found: readonly string[];
  readonly nameLeft: number;
  readonly extensionLeft: number;
  readonly sizeRight: number;
  readonly dateLeft: number;
  readonly checkLeft: number;
  readonly checkSize: number;
  readonly gitLeft: number | undefined;
  readonly gitSize: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface LineRecord extends RowRecord {
  readonly seen: Omit<SeenLine, 'left' | 'top' | 'width' | 'height'>;
}

const tickPath = 'M4.5 8.2 7 10.7l4.5-5';

const tickBox = 16;

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

export function lineRecordOf({
  look,
  index,
  top,
  pointed,
  icon,
  iconKey,
  looks,
  view,
  images,
  sign,
}: {
  readonly look: LineLook;
  readonly index: number;
  readonly top: number;
  readonly pointed: LinePointed | undefined;
  readonly icon: IconShown;
  readonly iconKey: string | undefined;
  readonly looks: PaneLooks;
  readonly view: ListView;
  readonly images: PaneImages;
  readonly sign: string;
}): LineRecord {
  const { runs, scale, pixelWidth } = view;
  const paint: RowPaint = { rects: [], tiles: [] };
  const topPixels = Math.round(top * scale);
  const heightPixels = Math.round((top + looks.height) * scale) - topPixels;
  const system = icon !== undefined && icon !== 'failed';
  const generic = system
    ? ''
    : look.folder
      ? ' generic-folder'
      : ' generic-file';
  const inks = looks.inksOf(
    `${look.classes}${generic}`,
    pointed !== undefined,
    pointed?.overCheck === true,
  );
  const { ground } = inks;
  const groundCss = cssOf(ground);
  paint.rects.push(0, topPixels, pixelWidth, heightPixels, packedOf(ground));
  if (look.classes.split(' ').includes('group-start')) {
    paint.rects.push(
      0,
      topPixels,
      pixelWidth,
      Math.max(1, Math.round(looks.hairline * scale)),
      packedOf(filled(ground, looks.border)),
    );
  }

  const tileAt = (
    left: number,
    width: number,
    key: string,
    draw: (context: OffscreenCanvasRenderingContext2D) => void,
  ) => {
    const tile = runs.painted(`${key}|${groundCss}`, width, groundCss, draw);
    if (tile !== undefined) {
      paint.tiles.push(
        left,
        topPixels,
        tile.u,
        tile.v,
        tile.width,
        runs.tileHeight,
        packedOf(ground),
      );
    }
  };
  const middle = (size: number) => Math.round((heightPixels - size) / 2);

  const iconPixels = Math.round(looks.iconSize * scale);
  const iconLeft = Math.round(looks.iconLeft * scale);
  const iconImage = system ? icon : images.get(inks.icon);
  const iconName = system ? iconKey : inks.icon;
  let iconShown: SeenLine['icon'] = 'none';
  if (iconImage !== undefined && iconName !== undefined) {
    iconShown = system ? 'system' : 'generic';
    const alpha = system ? inks.iconOpacity : 1;
    tileAt(
      iconLeft,
      iconPixels,
      `icon|${iconName}|${iconPixels}|${alpha}|${heightPixels}`,
      (context) => {
        context.globalAlpha = alpha;
        context.imageSmoothingQuality = 'high';
        context.drawImage(
          iconImage,
          0,
          middle(iconPixels),
          iconPixels,
          iconPixels,
        );
      },
    );
  }

  const { check } = inks;
  if (check !== undefined) {
    const left = Math.round(looks.checkLeft * scale);
    const size = Math.round((looks.checkLeft + looks.checkSize) * scale) - left;
    const inset = looks.hairline - 1;
    const tickAt = {
      left: (looks.checkLeft + inset) * scale - left,
      top: ((looks.height - looks.checkSize) / 2 + inset) * scale,
      size: (looks.checkSize - 2 * inset) * scale,
    };
    tileAt(left, size, checkKey(check, size, heightPixels), (context) =>
      drawCheck(context, check, ground, size, middle(size), scale, tickAt),
    );
  }

  const fontScale = scale / looks.textScale;
  const font = `${looks.font.weight} ${looks.font.size * fontScale}px ${looks.font.family}`;
  const spacing = looks.spacing * fontScale;
  const runLook = {
    ink: inks.ink,
    ground,
    markInk: looks.markInk,
    markGround: looks.markGround,
    markTop: looks.markTop,
    markHeight: looks.markHeight,
  };
  const found: string[] = [];
  const cut: string[] = [];
  const put = (
    part: string,
    text: string,
    cell: { readonly left: number; readonly width: number },
    ink: string,
    ranges: readonly FindRange[],
    end: boolean,
  ) => {
    if (text === '') {
      return '';
    }
    const room = cell.width * scale;
    const whole = runs.measure(text, font, spacing);
    const shown =
      whole <= room ? text : fitted(runs, text, font, room, spacing);
    if (shown !== text) {
      cut.push(part);
    }
    const marks = shownRanges(ranges, shown);
    found.push(...marks.map((range) => shown.slice(range.start, range.end)));
    putRun(paint, runs, scale, top, runLook, {
      text: shown,
      font,
      x:
        (laidOut(
          (end && shown === text
            ? cell.left + cell.width - whole / scale
            : cell.left) * scale,
        ) +
          view.shiftX) /
        scale,
      baseline: looks.baseline,
      inks: [{ start: 0, end: shown.length, ink }],
      marks,
      spacing,
    });
    return shown;
  };
  const drawn = put(
    'name',
    look.name,
    looks.name,
    inks.ink,
    look.nameFound,
    false,
  );
  put(
    'extension',
    look.extension,
    looks.extension,
    inks.ink,
    look.extensionFound,
    false,
  );
  put(
    'size',
    look.size,
    looks.size,
    look.counting ? inks.counting : inks.ink,
    [],
    true,
  );
  put('date', look.date, looks.date, inks.ink, [], false);

  const gitPixels = Math.round(looks.gitSize * scale);
  if (look.repository && pointed === undefined) {
    const mark = images.get(looks.gitMark?.(inks.ink));
    if (mark !== undefined) {
      tileAt(
        Math.round(looks.gitLeft * scale),
        gitPixels,
        `git|${inks.ink}|${gitPixels}|${heightPixels}`,
        (context) =>
          context.drawImage(mark, 0, middle(gitPixels), gitPixels, gitPixels),
      );
    }
  }

  const classes = [
    ...`${look.classes}${generic}`.trim().split(' '),
    ...(pointed === undefined ? [] : ['pointed']),
  ];
  return {
    sign,
    ...paint,
    seen: {
      index,
      key: look.key,
      name: look.folder ? look.name.slice(1, -1) : look.name,
      drawn,
      extension: look.extension,
      size: look.size,
      date: look.date,
      classes,
      icon: iconShown,
      check:
        check === undefined
          ? 'none'
          : check.tick === undefined
            ? 'empty'
            : 'checked',
      found,
      cut,
      family: looks.font.family,
      ground: groundCss,
      ink: inks.ink,
      iconOpacity: system ? inks.iconOpacity : 1,
      nameLeft: looks.name.left,
      extensionLeft: looks.extension.left,
      sizeRight: looks.size.left + looks.size.width,
      dateLeft: looks.date.left,
      checkLeft: looks.checkLeft,
      checkSize: looks.checkSize,
      gitLeft: look.repository ? looks.gitLeft : undefined,
      gitSize: looks.gitSize,
    },
  };
}

function checkKey(check: CheckLook, size: number, height: number): string {
  return `check|${size}|${height}|${check.edge.join(',')}|${check.fill?.join(',') ?? ''}|${check.tick?.join(',') ?? ''}|${check.thickness}`;
}

function drawCheck(
  context: OffscreenCanvasRenderingContext2D,
  check: CheckLook,
  ground: Rgba,
  size: number,
  top: number,
  scale: number,
  tickAt: {
    readonly left: number;
    readonly top: number;
    readonly size: number;
  },
): void {
  const edge = Math.max(1, Math.floor(check.thickness * scale + 1e-6));
  context.fillStyle = cssOf(check.edge);
  context.fillRect(0, top, size, size);
  context.fillStyle = cssOf(check.fill ?? ground);
  context.fillRect(edge, top + edge, size - 2 * edge, size - 2 * edge);
  if (check.tick === undefined) {
    return;
  }
  context.save();
  context.translate(tickAt.left, tickAt.top);
  context.scale(tickAt.size / tickBox, tickAt.size / tickBox);
  context.lineWidth = 2;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = cssOf(check.tick);
  context.stroke(new Path2D(tickPath));
  context.restore();
}

const layoutUnits = 64;

const laidOut = (device: number) =>
  Math.round(device * layoutUnits) / layoutUnits;
