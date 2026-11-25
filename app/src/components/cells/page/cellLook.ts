import { over, parsedColor, type Rgba } from './cellColors';
import type { CellMetrics } from './glyphTiles';
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

export const layerOf = (element: Element): Rgba =>
  parsedColor(getComputedStyle(element).backgroundColor);

export function probedRow(host: Element, rowClass: string): HTMLDivElement {
  const row = document.createElement('div');
  row.className = rowClass;
  row.style.position = 'absolute';
  row.style.visibility = 'hidden';
  host.append(row);
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
  over(
    [0, 0, 0, 1],
    parsedColor(
      behind === null ? '' : getComputedStyle(behind).backgroundColor,
    ),
  );

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
