import { tabStop } from './wordWrap';

export interface TextWidths {
  readonly char: number;
  readonly of: (cluster: string) => number;
}

interface TextMeasurer {
  font: string;
  measureText(text: string): { readonly width: number };
}

function canvasMeasurer(): TextMeasurer | null {
  return new OffscreenCanvas(0, 0).getContext('2d');
}

export function textWidths(
  char: number,
  font: string,
  spacing: number,
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
  return {
    char,
    of: (cluster) => {
      const known = drawn.get(cluster);
      if (known !== undefined) {
        return known;
      }
      const width = measure(cluster);
      drawn.set(cluster, width);
      return width;
    },
  };
}

export function fontOf(element: HTMLElement): string {
  const { fontStyle, fontWeight, fontSize, fontFamily } =
    getComputedStyle(element);
  return `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;
}

export function spacingOf(element: HTMLElement): number {
  const spacing = parseFloat(getComputedStyle(element).letterSpacing);
  return Number.isFinite(spacing) ? spacing : 0;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

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
