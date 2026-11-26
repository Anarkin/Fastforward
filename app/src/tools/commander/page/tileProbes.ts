import {
  filled,
  parsedColor,
  type Rgba,
} from '../../../components/cells/page/cellColors';
import { probed } from '../../../components/cells/page/listLooks';
import { overCheckAttribute } from './lineCheck';
import { groundOf, urlOf, type PaneLooks } from './paneLooks';
import { outlineOf, type Outline } from './rowOutline';

interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface TileCheck {
  readonly ring: Rgba;
  readonly edge: Rgba;
  readonly fill: Rgba;
  readonly tick: Rgba | undefined;
}

interface TileInks {
  readonly ground: Rgba;
  readonly ink: string;
  readonly counting: string;
  readonly thumbnailOpacity: number;
  readonly check: TileCheck | undefined;
  readonly outline: Outline | undefined;
}

export interface TileLooks {
  readonly width: number;
  readonly height: number;
  readonly padding: number;
  readonly thumbnail: Box;
  readonly nameTop: number;
  readonly sizeTop: number;
  readonly dateTop: number;
  readonly baseline: number;
  readonly check: Box;
  readonly iconSize: number;
  readonly genericSize: number;
  readonly inksOf: (
    classes: string,
    pointed: boolean,
    overCheck: boolean,
  ) => TileInks;
  readonly nameInkOf: (
    classes: string,
    nameClass: string,
    nameColor: string | undefined,
  ) => string;
  readonly genericOf: (folder: boolean) => string | undefined;
  readonly dispose: () => void;
}

const shown = (content: string) => content !== 'none' && content !== 'normal';

function iconOutlineOf(name: string, color: string): string | undefined {
  const url = urlOf(
    getComputedStyle(document.body).getPropertyValue(`--${name}-outline`),
  );
  const comma = url?.indexOf(',') ?? -1;
  if (url === undefined || comma === -1) {
    return undefined;
  }
  const drawing = decodeURIComponent(url.slice(comma + 1)).replaceAll(
    "stroke='black'",
    `stroke='${color}'`,
  );
  return `data:image/svg+xml,${encodeURIComponent(drawing)}`;
}

export function tileLooksOf(
  host: HTMLElement,
  lines: PaneLooks,
  tileWidth: number,
  thumbnailSize: number,
): TileLooks {
  const probe = probed(
    host,
    `<div class="row commander-row commander-tile" data-tile>` +
      `<span class="commander-check" data-check><span class="check-box" data-box></span></span>` +
      `<div class="commander-thumbnail" data-thumbnail><span class="commander-icon" data-slot><span class="system-icon" data-system></span></span></div>` +
      `<div class="commander-tile-name" data-name><span data-part><span class="commander-tile-base">a<span data-baseline></span></span></span></div>` +
      `<div class="commander-tile-size" data-size>1</div>` +
      `<div class="commander-tile-date" data-date>a</div>` +
      `</div><span data-ring></span>`,
  );
  probe.style.left = '0';
  probe.style.top = '0';
  const at = (selector: string) => {
    const element = probe.querySelector<HTMLElement>(selector);
    if (element === null) {
      throw new Error(`No ${selector} to read the tiles from`);
    }
    return element;
  };
  const tile = at('[data-tile]');
  tile.style.width = `${tileWidth}px`;
  at('[data-thumbnail]').style.height = `${thumbnailSize}px`;
  const ring = at('[data-ring]');
  ring.style.background = 'var(--color-panel-background)';
  const baseline = at('[data-baseline]');
  baseline.style.display = 'inline-block';
  baseline.style.verticalAlign = 'baseline';
  baseline.style.height = '0';
  const box = tile.getBoundingClientRect();
  const boxOf = (selector: string): Box => {
    const found = at(selector).getBoundingClientRect();
    return {
      left: found.left - box.left,
      top: found.top - box.top,
      width: found.width,
      height: found.height,
    };
  };
  const slot = at('[data-slot]');
  const muted = getComputedStyle(slot).color;
  const folderIcon = iconOutlineOf('folder', muted);
  const fileIcon = iconOutlineOf('file', muted);
  const iconProbe = document.createElement('span');
  iconProbe.className = 'icon folder-icon';
  slot.append(iconProbe);
  const genericSize =
    parseFloat(getComputedStyle(iconProbe).maskSize) ||
    parseFloat(getComputedStyle(iconProbe).width) ||
    16;
  iconProbe.remove();
  const name = at('[data-name]').getBoundingClientRect();
  const inks = new Map<string, TileInks>();
  const names = new Map<string, string>();
  const part = at('[data-part]');
  return {
    width: box.width,
    height: box.height,
    padding: parseFloat(getComputedStyle(tile).paddingLeft) || 0,
    thumbnail: boxOf('[data-thumbnail]'),
    nameTop: name.top - box.top,
    sizeTop: boxOf('[data-size]').top,
    dateTop: boxOf('[data-date]').top,
    baseline: baseline.getBoundingClientRect().bottom - name.top,
    check: boxOf('[data-check]'),
    iconSize: at('[data-system]').getBoundingClientRect().width || 32,
    genericSize,
    inksOf: (classes, pointed, overCheck) => {
      const key = `${classes}|${pointed}|${overCheck}`;
      const known = inks.get(key);
      if (known !== undefined) {
        return known;
      }
      tile.className = `${classes}${pointed ? ' pointed' : ''}`;
      tile.toggleAttribute(overCheckAttribute, overCheck);
      const style = getComputedStyle(tile);
      const ground = groundOf(style, lines.ground);
      const check = at('[data-check]');
      const checkBox = at('[data-box]');
      const boxStyle = getComputedStyle(checkBox);
      const after = getComputedStyle(checkBox, '::after');
      const fill = parsedColor(boxStyle.backgroundColor);
      const made: TileInks = {
        ground,
        ink: style.color,
        counting: getComputedStyle(at('[data-size]')).color,
        thumbnailOpacity: Number(
          getComputedStyle(at('[data-thumbnail]')).opacity,
        ),
        check:
          getComputedStyle(check).visibility === 'visible'
            ? {
                ring: filled(
                  ground,
                  parsedColor(getComputedStyle(ring).backgroundColor),
                ),
                edge: filled(ground, parsedColor(boxStyle.borderTopColor)),
                fill: filled(ground, fill),
                tick: shown(after.content)
                  ? filled(ground, parsedColor(after.backgroundColor))
                  : undefined,
              }
            : undefined,
        outline: outlineOf(style, ground),
      };
      inks.set(key, made);
      return made;
    },
    nameInkOf: (classes, nameClass, nameColor) => {
      const key = `${classes}|${nameClass}|${nameColor ?? ''}`;
      const known = names.get(key);
      if (known !== undefined) {
        return known;
      }
      tile.className = classes;
      part.className = nameClass;
      if (nameColor === undefined) {
        part.style.removeProperty('--file-color');
      } else {
        part.style.setProperty('--file-color', nameColor);
      }
      const ink = getComputedStyle(part).color;
      names.set(key, ink);
      return ink;
    },
    genericOf: (folder) => (folder ? folderIcon : fileIcon),
    dispose: () => probe.remove(),
  };
}
