import { cellsOf, plainCells, type CellTable } from './cellTable';

export interface TextWidths {
  readonly char: number;
  readonly of: (cluster: string) => number;
  readonly boxed?: (cluster: string) => number | undefined;
  readonly scaled?: (cluster: string) => number | undefined;
}

const counted = new WeakMap<CellTable, TextWidths>();

export function cellWidthsOf(table: CellTable): TextWidths {
  let widths = counted.get(table);
  if (widths === undefined) {
    widths = { char: 1, of: (cluster) => cellsOf(cluster, table) };
    counted.set(table, widths);
  }
  return widths;
}

const drawnLikeCells = 0.01;

interface TextMeasurer {
  font: string;
  measureText(text: string): { readonly width: number };
}

function canvasMeasurer(): TextMeasurer | null {
  return typeof OffscreenCanvas === 'undefined'
    ? null
    : new OffscreenCanvas(0, 0).getContext('2d');
}

export function textWidths(
  char: number,
  font: string,
  spacing: number,
  table: CellTable,
  measurer: () => TextMeasurer | null = canvasMeasurer,
): TextWidths {
  const drawn = new Map<string, number>();
  let context: TextMeasurer | null | undefined;
  const measure = (cluster: string) => {
    if (context === undefined) {
      context = measurer();
      if (context) {
        context.font = font;
      }
    }
    return context
      ? context.measureText(cluster).width + spacing
      : cluster.length * char;
  };
  const drawnWidth = (cluster: string) => {
    const known = drawn.get(cluster);
    if (known !== undefined) {
      return known;
    }
    const width = measure(cluster);
    drawn.set(cluster, width);
    return width;
  };
  if (table === plainCells) {
    return { char, of: drawnWidth };
  }
  return {
    char,
    of: (cluster) => cellsOf(cluster, table) * char,
    boxed: (cluster) => {
      const cells = cellsOf(cluster, table);
      return Math.abs(drawnWidth(cluster) - cells * char) > drawnLikeCells
        ? cells
        : undefined;
    },
    scaled: (cluster) => {
      const room = cellsOf(cluster, table) * char;
      const width = drawnWidth(cluster);
      return room > 0 && width > room + drawnLikeCells
        ? room / width
        : undefined;
    },
  };
}

export function fontOf(element: Element): string {
  const { fontStyle, fontWeight, fontSize, fontFamily } =
    getComputedStyle(element);
  return `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;
}

export function spacingOf(element: Element): number {
  const spacing = parseFloat(getComputedStyle(element).letterSpacing);
  return Number.isFinite(spacing) ? spacing : 0;
}

export const graphemes = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
});

export function elementWidths(
  element: Element,
  table: CellTable,
): TextWidths | undefined {
  const measurer = canvasMeasurer();
  if (measurer === null) {
    return undefined;
  }
  const font = fontOf(element);
  const spacing = spacingOf(element);
  measurer.font = font;
  const char = measurer.measureText('0').width + spacing;
  return char > 0
    ? textWidths(char, font, spacing, table, () => measurer)
    : undefined;
}

const cellClasses = ['cell zero', 'cell', 'cell wide'];

export const cellClass = (cells: number): string =>
  cellClasses[cells] ?? 'cell';

export const nonAscii = /[^\0-\x7f]/;

export type CellPart =
  | { readonly text: string; readonly cells?: undefined }
  | {
      readonly text: string;
      readonly cells: number;
      readonly scale: number | undefined;
    };

export function cellParts(text: string, widths: TextWidths): CellPart[] {
  if (widths.boxed === undefined || !nonAscii.test(text)) {
    return [{ text }];
  }
  const parts: CellPart[] = [];
  let plain = '';
  for (const { segment } of graphemes.segment(text)) {
    const cells = nonAscii.test(segment) ? widths.boxed(segment) : undefined;
    if (cells === undefined) {
      plain += segment;
      continue;
    }
    if (plain !== '') {
      parts.push({ text: plain });
      plain = '';
    }
    parts.push({ text: segment, cells, scale: widths.scaled?.(segment) });
  }
  if (plain !== '') {
    parts.push({ text: plain });
  }
  return parts;
}
