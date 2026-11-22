import { over, parsedColor } from './cellColors';
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

function probedRow(host: Element): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'viewer-row';
  row.style.position = 'absolute';
  row.style.visibility = 'hidden';
  host.append(row);
  return row;
}

export function textLookOf(host: Element): TextLook {
  const row = probedRow(host);
  const made = (tag: string, className: string) => {
    const element = document.createElement(tag);
    element.className = className;
    row.append(element);
    return element;
  };
  const colored = kinds.map(
    (kind) => [kind, made('span', `syntax-${kind}`)] as const,
  );
  const muted = made('span', '');
  muted.style.color = 'var(--muted-foreground)';
  const match = made('mark', 'find-match');
  const current = made('mark', 'find-match current');
  const occurrence = made('mark', 'occurrence-match');
  const selected = made('span', '');
  selected.style.background = 'var(--selection-background)';
  const ground = over(
    [0, 0, 0, 1],
    parsedColor(
      host.parentElement === null
        ? ''
        : getComputedStyle(host.parentElement).backgroundColor,
    ),
  );
  const groundOf = (element: Element) =>
    over(ground, parsedColor(getComputedStyle(element).backgroundColor));
  const look: TextLook = {
    ground,
    muted: colorOf(muted),
    dots: over(ground, parsedColor(colorOf(muted))),
    plain: colorOf(row),
    kinds: new Map(colored.map(([kind, element]) => [kind, colorOf(element)])),
    match: { ink: colorOf(match), ground: groundOf(match) },
    current: { ink: colorOf(current), ground: groundOf(current) },
    occurrence: { ink: undefined, ground: groundOf(occurrence) },
    selected: groundOf(selected),
  };
  row.remove();
  return look;
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
): CellMetrics {
  const row = probedRow(host);
  row.textContent = 'x';
  const mark = document.createElement('span');
  mark.style.display = 'inline-block';
  row.append(mark);
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
