import { filled, over, parsedColor, type Rgba } from './cellColors';
import type { CellMetrics } from './glyphTiles';
import { probed } from './listLooks';
import type { TextLook } from './textCells';

const kinds = [
  'plain',
  'keyword',
  'type',
  'function',
  'string',
  'number',
  'comment',
];

const colorOf = (element: Element) => getComputedStyle(element).color;

export const backgroundOf = (style: CSSStyleDeclaration): Rgba =>
  parsedColor(style.backgroundColor);

export const layerOf = (element: Element): Rgba =>
  backgroundOf(getComputedStyle(element));

export function groundUnder(element: Element): Rgba {
  const layers: Rgba[] = [];
  for (let at: Element | null = element; at !== null; at = at.parentElement) {
    const layer = layerOf(at);
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

const gradient =
  /linear-gradient\(\s*((?:rgba?|color|hsla?|oklch|oklab|lab|lch)\([^)]*\)|#[\da-f]+|[a-z]+)/gi;

export function tintedGround(style: CSSStyleDeclaration, under: Rgba): Rgba {
  let ground = filled(under, backgroundOf(style));
  const tints = [...style.backgroundImage.matchAll(gradient)].map(([, color]) =>
    parsedColor(color ?? ''),
  );
  for (const tint of tints.toReversed()) {
    ground = filled(ground, tint);
  }
  return ground;
}

export function probedRow(host: Element, rowClass: string): HTMLDivElement {
  const row = probed(host, '');
  row.className = rowClass;
  return row;
}

export function probedIn(
  within: Element,
  tag: string,
  className: string,
): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  within.append(element);
  return element;
}

export const solidOn = (ground: Rgba, element: Element): Rgba =>
  over(ground, layerOf(element));

export const groundBehind = (behind: Element | null): Rgba =>
  over([0, 0, 0, 1], behind === null ? parsedColor('') : layerOf(behind));

export function lookWithin(
  row: HTMLElement,
  ground: Rgba,
  more: readonly (readonly [kind: string, className: string])[] = [],
): TextLook {
  const made = (tag: string, className: string) =>
    probedIn(row, tag, className);
  const colored = kinds.map(
    (kind) => [kind, made('span', `syntax-${kind}`)] as const,
  );
  const muted = made('span', '');
  muted.style.color = 'var(--muted-foreground)';
  for (const [kind, className] of more) {
    colored.push([kind, made('span', className)]);
  }
  const match = made('mark', 'find-match');
  const current = made('mark', 'find-match current');
  const occurrence = made('mark', 'occurrence-match');
  const selected = made('span', '');
  selected.style.background = 'var(--selection-background)';
  return {
    ground,
    muted: colorOf(muted),
    dots: over(ground, parsedColor(colorOf(muted))),
    dot: parsedColor(colorOf(muted)),
    plain: colorOf(row),
    kinds: new Map(colored.map(([kind, element]) => [kind, colorOf(element)])),
    match: { ink: colorOf(match), ground: layerOf(match) },
    current: { ink: colorOf(current), ground: layerOf(current) },
    occurrence: { ink: colorOf(occurrence), ground: layerOf(occurrence) },
    selected: layerOf(selected),
  };
}

const sized = /(\d+(?:\.\d+)?)px/;

export interface CellFont {
  readonly char: number;
  readonly family: string;
  readonly spacing: number;
}

export function cellMetricsOf(
  host: Element,
  font: CellFont,
  ratio: number,
  shift: number,
  rowClass: string,
  textClass?: string,
): CellMetrics {
  const row = probedRow(host, rowClass);
  const text = textClass === undefined ? row : probedIn(row, 'span', textClass);
  text.textContent = 'x';
  const mark = document.createElement('span');
  mark.style.display = 'inline-block';
  text.append(mark);
  const box = row.getBoundingClientRect();
  const baseline = mark.getBoundingClientRect().bottom - box.top;
  row.remove();
  const size = Number(sized.exec(font.family)?.[1] ?? 12) * ratio;
  return {
    advance: Math.round(font.char * ratio),
    rowHeight: Math.round(box.height * ratio),
    baseline: Math.round(baseline * ratio),
    spacing: font.spacing * ratio,
    shift,
    fontAt: (scale) => font.family.replace(sized, `${size * scale}px`),
  };
}
