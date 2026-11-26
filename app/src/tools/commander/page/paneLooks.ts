import {
  filled,
  parsedColor,
  type Rgba,
} from '../../../components/cells/page/cellColors';
import {
  probed,
  shapedSample,
  textScaleOf,
} from '../../../components/cells/page/listLooks';
import { checkSize, checkStart, overCheckAttribute } from './lineCheck';
import { outlineOf, type Outline } from './rowOutline';

interface TextFont {
  readonly family: string;
  readonly size: number;
  readonly weight: string;
}

interface Cell {
  readonly left: number;
  readonly width: number;
}

export interface CheckLook {
  readonly edge: Rgba;
  readonly fill: Rgba | undefined;
  readonly tick: Rgba | undefined;
  readonly thickness: number;
}

interface LineInks {
  readonly ground: Rgba;
  readonly ink: string;
  readonly iconOpacity: number;
  readonly counting: string;
  readonly check: CheckLook | undefined;
  readonly icon: string | undefined;
  readonly outline: Outline | undefined;
}

export interface PaneLooks {
  readonly ground: Rgba;
  readonly font: TextFont;
  readonly spacing: number;
  readonly advance: number;
  readonly baseline: number;
  readonly textScale: number;
  readonly height: number;
  readonly name: Cell;
  readonly extension: Cell;
  readonly size: Cell;
  readonly date: Cell;
  readonly iconLeft: number;
  readonly iconSize: number;
  readonly checkLeft: number;
  readonly checkSize: number;
  readonly markInk: string;
  readonly markGround: Rgba;
  readonly markTop: number;
  readonly markHeight: number;
  readonly hairline: number;
  readonly border: Rgba;
  readonly gitMark: ((ink: string) => string) | undefined;
  readonly gitLeft: number;
  readonly gitSize: number;
  readonly inksOf: (
    classes: string,
    pointed: boolean,
    overCheck: boolean,
  ) => LineInks;
  readonly dispose: () => void;
}

const fontOf = (style: CSSStyleDeclaration): TextFont => ({
  family: style.fontFamily,
  size: parseFloat(style.fontSize),
  weight: style.fontWeight,
});

const gradient =
  /linear-gradient\(\s*((?:rgba?|color|hsla?|oklch|oklab|lab|lch)\([^)]*\)|#[\da-f]+|[a-z]+)/gi;

export function groundOf(style: CSSStyleDeclaration, under: Rgba): Rgba {
  let ground = filled(under, parsedColor(style.backgroundColor));
  const tints = [...style.backgroundImage.matchAll(gradient)].map(([, color]) =>
    parsedColor(color ?? ''),
  );
  for (const tint of tints.toReversed()) {
    ground = filled(ground, tint);
  }
  return ground;
}

function solidBehind(element: Element): Rgba {
  const layers: Rgba[] = [];
  for (let at: Element | null = element; at !== null; at = at.parentElement) {
    const layer = parsedColor(getComputedStyle(at).backgroundColor);
    if (layer[3] > 0) {
      layers.push(layer);
      if (layer[3] >= 1) {
        break;
      }
    }
  }
  return layers.reduceRight<Rgba>(
    (under, layer) => filled(under, layer),
    [255, 255, 255, 1],
  );
}

export const urlOf = (value: string): string | undefined =>
  /url\(\s*"?([^")]*)"?\s*\)/.exec(value)?.[1];

function lineProbe(classes: string): string {
  return `<div class="${classes}"><span class="commander-name">a</span><span class="commander-extension">a</span><span class="commander-size">1</span><span class="commander-date">a</span></div>`;
}

export function paneLooksOf(
  host: HTMLElement,
  width: number,
  scale: number,
  gitIcon: Element | null,
): PaneLooks {
  const probe = probed(
    host,
    lineProbe('row commander-row commander-line') +
      `<div class="row commander-row commander-line" data-marked><span class="commander-name" data-mark-host></span></div>` +
      `<div class="row commander-row commander-line" data-sample><span class="commander-name" data-text></span></div>` +
      `<div class="row commander-row commander-line" data-look><span class="commander-name">a<span data-baseline></span></span><span class="commander-extension"></span><span class="commander-size counting" data-counting>1</span><span class="system-icon" data-system-icon></span></div>` +
      `<div class="row commander-row commander-line" data-git><span class="commander-name"></span><span class="commander-extension"><span class="commander-mark" data-mark></span></span></div>` +
      `<div class="row commander-row commander-line" data-icon-row><span data-icon></span></div><span data-advance></span><span data-hairline></span><span data-border></span>`,
  );
  probe.style.left = '0';
  probe.style.top = '0';
  probe.style.width = `${width}px`;
  const at = (selector: string) => {
    const element = probe.querySelector<HTMLElement>(selector);
    if (element === null) {
      throw new Error(`No ${selector} to read the commander from`);
    }
    return element;
  };
  const line = at('.commander-line');
  const box = line.getBoundingClientRect();
  const cellOf = (selector: string): Cell => {
    const cell = at(`.commander-line > ${selector}`).getBoundingClientRect();
    return { left: cell.left - box.left, width: cell.width };
  };
  const baseline = at('[data-baseline]');
  baseline.style.display = 'inline-block';
  baseline.style.verticalAlign = 'baseline';
  baseline.style.height = '0';
  const hairline = at('[data-hairline]');
  hairline.style.cssText =
    'display:block;height:var(--hairline);background:var(--color-border)';
  const icon = at('[data-icon]');
  icon.style.cssText =
    'position:absolute;left:var(--commander-row-start);width:16px;height:16px';
  const iconRow = at('[data-icon-row]');
  iconRow.style.position = 'relative';
  const advance = at('[data-advance]');
  advance.style.cssText = 'display:block;width:var(--commander-advance)';
  const mark = document.createElement('mark');
  mark.className = 'match';
  mark.textContent = 'a';
  at('[data-mark-host]').append(mark);
  const markRow = at('[data-marked]').getBoundingClientRect();
  const markBox = mark.getBoundingClientRect();
  const sample = at('[data-text]');
  sample.textContent = shapedSample;
  const lineStyle = getComputedStyle(line);
  const ground = solidBehind(host);
  const looked = at('[data-look]');
  const mark2 = at('[data-mark]');
  const gitShape = gitIcon?.querySelector('svg');
  if (gitShape !== null && gitShape !== undefined) {
    mark2.append(gitShape.cloneNode(true));
  }
  const gitBox = mark2.getBoundingClientRect();
  const gitRow = at('[data-git]').getBoundingClientRect();
  const gitSvg = mark2.querySelector('svg');
  const gitDrawing =
    gitSvg === null ? undefined : new XMLSerializer().serializeToString(gitSvg);
  const gitMark =
    gitDrawing === undefined
      ? undefined
      : (ink: string) =>
          `data:image/svg+xml,${encodeURIComponent(
            gitDrawing.replaceAll('currentColor', ink),
          )}`;
  const inks = new Map<string, LineInks>();
  const looks: PaneLooks = {
    ground,
    font: fontOf(lineStyle),
    spacing: parseFloat(lineStyle.letterSpacing) || 0,
    advance: advance.getBoundingClientRect().width,
    baseline:
      baseline.getBoundingClientRect().bottom -
      looked.getBoundingClientRect().top,
    textScale: textScaleOf(sample, scale),
    height: box.height,
    name: cellOf('.commander-name'),
    extension: cellOf('.commander-extension'),
    size: cellOf('.commander-size'),
    date: cellOf('.commander-date'),
    iconLeft:
      icon.getBoundingClientRect().left - iconRow.getBoundingClientRect().left,
    iconSize: icon.getBoundingClientRect().width,
    checkLeft: checkStart,
    checkSize,
    markInk: getComputedStyle(mark).color,
    markGround: filled(
      ground,
      parsedColor(getComputedStyle(mark).backgroundColor),
    ),
    markTop: markBox.top - markRow.top,
    markHeight: markBox.height,
    hairline: hairline.getBoundingClientRect().height,
    border: parsedColor(getComputedStyle(hairline).backgroundColor),
    gitMark,
    gitLeft: gitBox.left - gitRow.left,
    gitSize: gitBox.width,
    inksOf: (classes, pointed, overCheck) => {
      const key = `${classes}|${pointed}|${overCheck}`;
      const known = inks.get(key);
      if (known !== undefined) {
        return known;
      }
      looked.className = `${classes}${pointed ? ' pointed' : ''}`;
      looked.toggleAttribute(overCheckAttribute, overCheck);
      const style = getComputedStyle(looked);
      const rowGround = groundOf(style, ground);
      const before = getComputedStyle(looked, '::before');
      const after = getComputedStyle(looked, '::after');
      const boxed = before.content !== 'none' && before.content !== 'normal';
      const ticked = after.content !== 'none' && after.content !== 'normal';
      const fill = parsedColor(before.backgroundColor);
      const made: LineInks = {
        ground: rowGround,
        ink: style.color,
        iconOpacity: Number(getComputedStyle(at('[data-system-icon]')).opacity),
        counting: getComputedStyle(at('[data-counting]')).color,
        check: boxed
          ? {
              edge: filled(rowGround, parsedColor(before.borderTopColor)),
              fill: fill[3] > 0 ? filled(rowGround, fill) : undefined,
              tick: ticked
                ? filled(rowGround, parsedColor(after.backgroundColor))
                : undefined,
              thickness: parseFloat(before.borderTopWidth) || 1,
            }
          : undefined,
        icon: urlOf(style.getPropertyValue('--row-icon')),
        outline: outlineOf(style, rowGround),
      };
      inks.set(key, made);
      return made;
    },
    dispose: () => probe.remove(),
  };
  return looks;
}
