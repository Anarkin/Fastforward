import { snapOffset } from '../../../lib/page/devicePixels';
import type { TextWidths } from '../../../lib/page/textWidths';
import { tabSize } from '../../../lib/page/wordWrap';
import type { DiffRow } from './diffRows';
import { sideRoom, type Edges } from './diffScrolling';
import {
  codePadding,
  markerWidth,
  numberWidth,
  textColumn,
  type Sideways,
} from './overflow';
import type { WrapColumns } from './rowMeasures';

declare module 'react' {
  interface CSSProperties {
    readonly '--diff-file-height'?: string;
    readonly '--diff-row-top'?: string;
    readonly '--diff-tab-size'?: string;
    readonly '--diff-number-width'?: string;
    readonly '--diff-code-padding'?: string;
    readonly '--diff-marker-width'?: string;
    readonly '--diff-content-width'?: string;
    readonly '--diff-word-padding-top'?: string;
    readonly '--diff-gap-width'?: string;
    readonly '--diff-word-padding-bottom'?: string;
    readonly '--split-scroll'?: string;
    readonly '--diff-snap-inline'?: string;
    readonly '--diff-snap-left'?: string;
    readonly '--diff-snap-right'?: string;
    readonly '--diff-side-snap'?: string;
    readonly '--wrap-indent'?: string;
    readonly '--visible-left'?: string;
    readonly '--visible-right'?: string;
  }
}

export const unmeasured: WrapColumns = { left: Infinity, right: Infinity };

export interface TextMeasures {
  readonly charWidth: number;
  readonly font: string;
  readonly spacing: number;
  readonly scale: number;
  readonly lineHeight: number;
  readonly padding: Edges;
}

const layoutSteps = 64;

function onLayoutStep(gap: number, scale: number): number {
  const steps = Math.round(Math.max(0, gap) * scale * layoutSteps);
  return (steps + 0.25) / (scale * layoutSteps);
}

export function gapWidth(scale: number): number {
  return onLayoutStep(Math.max(2, Math.round(2 * scale)) / scale, scale);
}

export function wordPadding(line: Edges, text: Edges, scale: number): Edges {
  return text.bottom > text.top
    ? {
        top: onLayoutStep(text.top - line.top, scale),
        bottom: onLayoutStep(line.bottom - text.bottom, scale),
      }
    : { top: 0, bottom: 0 };
}

export const unpadded: Edges = { top: 0, bottom: 0 };

export const sideSnaps: readonly React.CSSProperties[] = [
  { '--diff-side-snap': 'var(--diff-snap-left)' },
  { '--diff-side-snap': 'var(--diff-snap-right)' },
];

export interface CodeSnap {
  readonly inline: number;
  readonly left: number;
  readonly right: number;
}

export function codeSnapOf(
  starts: { readonly [K in keyof CodeSnap]: number | undefined },
  ratio: number,
  last: CodeSnap,
): CodeSnap {
  const snapped = (side: keyof CodeSnap) => {
    const start = starts[side];
    return start === undefined ? last[side] : snapOffset(start, ratio);
  };
  return {
    inline: snapped('inline'),
    left: snapped('left'),
    right: snapped('right'),
  };
}

function codeStart(
  line: Element | null | undefined,
  code: Element | null | undefined,
  unshifted: number,
): number | undefined {
  return line && code
    ? unshifted +
        code.getBoundingClientRect().left -
        line.getBoundingClientRect().left +
        codePadding
    : undefined;
}

export function codeStarts(list: HTMLElement): {
  readonly [K in keyof CodeSnap]: number | undefined;
} {
  const row = list.querySelector('.diff-row > .diff-line:not(.split-side)');
  const split = list.querySelector('.diff-row .split-line');
  const [left, right] = split
    ? Array.from(split.children)
    : [undefined, undefined];
  const splitLeft = split?.getBoundingClientRect().left ?? 0;
  const firstTrack = split
    ? parseFloat(getComputedStyle(split).gridTemplateColumns)
    : 0;
  return {
    inline: codeStart(
      row,
      row?.querySelector('.code'),
      row?.parentElement?.getBoundingClientRect().left ?? 0,
    ),
    left: codeStart(left, left?.querySelector('.split-code'), splitLeft),
    right: codeStart(
      right,
      right?.querySelector('.split-code'),
      splitLeft + firstTrack,
    ),
  };
}

export function sameSnap(one: CodeSnap, other: CodeSnap): boolean {
  return (['inline', 'left', 'right'] as const).every(
    (side) => Math.abs(one[side] - other[side]) < 1e-3,
  );
}

export function readSideways(
  element: HTMLElement,
  scrollsSides: boolean,
): Sideways {
  const minimap =
    parseFloat(getComputedStyle(element).getPropertyValue('--minimap-width')) ||
    0;
  if (scrollsSides) {
    const { side, widest } = sideRoom(element);
    return { scrolled: 0, width: side, room: widest, minimap };
  }
  return {
    scrolled: element.scrollLeft,
    width: element.clientWidth,
    room: element.scrollWidth - element.clientWidth,
    minimap,
  };
}

export const sameSideways = (a: Sideways | undefined, b: Sideways) =>
  a?.scrolled === b.scrolled &&
  a.width === b.width &&
  a.room === b.room &&
  a.minimap === b.minimap;

export const layoutVariables: React.CSSProperties = {
  '--diff-file-height': 'var(--diff-line-height)',
  '--diff-tab-size': String(tabSize),
  '--diff-number-width': `${numberWidth}px`,
  '--diff-code-padding': `${codePadding}px`,
  '--diff-marker-width': `${markerWidth}px`,
};

export function widestColumns(
  rows: readonly DiffRow[],
  widths?: TextWidths,
): number {
  let widest = 0;
  for (const row of rows) {
    if (row.kind === 'line' || row.kind === 'wholeLine') {
      const text = row.kind === 'line' ? row.line.text : row.text;
      widest = Math.max(widest, textColumn(text, text.length, widths));
    }
  }
  return widest;
}
