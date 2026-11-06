import { useEffect, useState } from 'react';
import type { IUnicodeVersionProvider, Terminal } from '@xterm/xterm';
import { tabStop } from './wordWrap';

export type CellTable = (cluster: string) => number;

export const plainCells: CellTable = (cluster) =>
  (cluster.codePointAt(0) ?? 0) < 0x20 ? 0 : 1;

let loadedTable: CellTable | undefined;

let loadingTable: Promise<CellTable> | undefined;

export interface TextWidths {
  readonly char: number;
  readonly of: (cluster: string) => number;
  readonly boxed?: (cluster: string) => number | undefined;
  readonly scaled?: (cluster: string) => number | undefined;
}

type Registering = Pick<Terminal, 'unicode'>;

interface TableAddon {
  activate(terminal: Registering): void;
}

const graphemesVersion = '15-graphemes';

const widthIn = (properties: number) => (properties >> 1) & 3;

const joinsPreceding = (properties: number) => (properties & 1) !== 0;

function cellsBy(provider: IUnicodeVersionProvider, cluster: string): number {
  let cells = 0;
  let preceding = 0;
  for (const char of cluster) {
    const properties = provider.charProperties(
      char.codePointAt(0) ?? 0,
      preceding,
    );
    cells +=
      widthIn(properties) -
      (joinsPreceding(properties) ? widthIn(preceding) : 0);
    preceding = properties;
  }
  return cells;
}

function tableOf(addon: TableAddon): CellTable {
  const registered: IUnicodeVersionProvider[] = [];
  addon.activate({
    unicode: {
      versions: [],
      activeVersion: '',
      register: (provider) => {
        registered.push(provider);
      },
    },
  });
  const provider = registered.find((each) => each.version === graphemesVersion);
  return provider === undefined
    ? plainCells
    : (cluster) => cellsBy(provider, cluster);
}

export function terminalCells(): Promise<CellTable> {
  loadingTable ??= import('@xterm/addon-unicode-graphemes').then(
    ({ UnicodeGraphemesAddon }) => {
      loadedTable = tableOf(new UnicodeGraphemesAddon());
      return loadedTable;
    },
  );
  return loadingTable;
}

export function useCellTable(): CellTable | undefined {
  const [table, setTable] = useState(() => loadedTable);
  useEffect(() => {
    if (table === undefined) {
      terminalCells().then(
        (loaded) => setTable(() => loaded),
        () => setTable(() => plainCells),
      );
    }
  }, [table]);
  return table;
}

export function cellsOf(
  cluster: string,
  table: CellTable = loadedTable ?? plainCells,
): number {
  return table(cluster);
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

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

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

const nonAscii = /[^\0-\x7f]/;

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

interface Range {
  readonly start: number;
  readonly end: number;
}

export function wholeClusters<T extends Range>(
  text: string,
  ranges: readonly T[],
): readonly T[] {
  if (ranges.length === 0 || !nonAscii.test(text)) {
    return ranges;
  }
  const clusters = graphemes.segment(text);
  const startOf = (at: number) =>
    at < text.length ? (clusters.containing(at)?.index ?? at) : at;
  const endOf = (at: number) => {
    const cluster = at < text.length ? clusters.containing(at) : undefined;
    return cluster === undefined || cluster.index === at
      ? at
      : cluster.index + cluster.segment.length;
  };
  return ranges.map((range) => {
    const start = startOf(range.start);
    const end = endOf(range.end);
    return start === range.start && end === range.end
      ? range
      : { ...range, start, end };
  });
}

export function columnsOf(
  text: string,
  widths: TextWidths | undefined,
): (index: number) => number {
  const special = widths ? /[^ -~]/g : /\t/g;
  let clusters: Intl.Segments | undefined;
  const clusterAt = (index: number) => {
    if (!widths || text[index] === '\t') {
      return undefined;
    }
    clusters ??= graphemes.segment(text);
    const cluster = clusters.containing(index);
    return (
      cluster && {
        start: cluster.index,
        end: cluster.index + cluster.segment.length,
        columns: widths.of(cluster.segment) / widths.char,
      }
    );
  };
  const specialFrom = (index: number) => {
    special.lastIndex = index;
    return special.exec(text)?.index ?? Infinity;
  };
  let at = 0;
  let column = 0;
  let next = specialFrom(0);
  return (index) => {
    while (next < index) {
      column += next - at;
      at = next;
      const cluster = clusterAt(at);
      if (!cluster) {
        column = tabStop(column);
        at += 1;
      } else if (cluster.end > index) {
        return column;
      } else {
        column += cluster.columns - (at - cluster.start);
        at = cluster.end;
      }
      next = specialFrom(at);
    }
    column += index - at;
    at = index;
    return column;
  };
}
