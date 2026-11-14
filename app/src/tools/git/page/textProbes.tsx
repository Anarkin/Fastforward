import { memo, useCallback, useRef } from 'react';
import { tabSize, wrapColumns } from '../../../lib/page/wordWrap';
import { snapOffset, watchDevicePixels } from '../../../lib/page/devicePixels';
import {
  codePadding,
  markerWidth,
  numberWidth,
  textColumn,
  type Sideways,
} from './overflow';
import {
  fontOf,
  spacingOf,
  type TextWidths,
} from '../../../lib/page/textWidths';
import type { DiffRow } from './diffRows';
import { uniformHeight, type WrapColumns } from './rowMeasures';
import { sideRoom, type Edges } from './diffScrolling';

const wrapSample = '0'.repeat(100);

export const unmeasured: WrapColumns = { left: Infinity, right: Infinity };

function measureWrapColumns(probe: HTMLElement): WrapColumns {
  const [left = Infinity, right = left] = Array.from(
    probe.querySelectorAll<HTMLElement>('.code'),
    (code) => {
      const style = getComputedStyle(code);
      const sample = code.firstElementChild;
      return wrapColumns(
        code.getBoundingClientRect().width -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight),
        sample ? sample.getBoundingClientRect().width / wrapSample.length : 0,
      );
    },
  );
  return { left, right };
}

export const WrapProbe = memo(function WrapProbe({
  split,
  numbers,
  onColumns,
}: {
  split: boolean;
  numbers: number;
  onColumns: (columns: WrapColumns) => void;
}) {
  const observe = useCallback(
    (probe: HTMLDivElement) => {
      const measure = () => onColumns(measureWrapColumns(probe));
      measure();
      const observer = new ResizeObserver(measure);
      for (const element of probe.querySelectorAll('.code, .wrap-sample')) {
        observer.observe(element);
      }
      return () => observer.disconnect();
    },
    [onColumns],
  );
  const code = (
    <span className="code">
      <span className="wrap-sample">{wrapSample}</span>
    </span>
  );
  return (
    <div className="wrap-probe" aria-hidden ref={observe}>
      {split ? (
        <div className="split-line">
          {[0, 1].map((side) => (
            <div
              key={side}
              className="diff-line split-side"
              style={sideSnaps[side]}
            >
              <span className="number" />
              <span className="split-code">{code}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="diff-line">
          {Array.from({ length: numbers }, (_, index) => (
            <span key={index} className="number" />
          ))}
          {code}
        </div>
      )}
    </div>
  );
});

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

function lineHeightOf(line: HTMLElement): number {
  const height = parseFloat(getComputedStyle(line).lineHeight);
  return height > 0 ? height : uniformHeight;
}

export const TextProbe = memo(function TextProbe({
  onMeasure,
}: {
  onMeasure: (
    charWidth: number,
    font: string,
    padding: Edges,
    scale: number,
    lineHeight: number,
    spacing: number,
  ) => void;
}) {
  const sample = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const observe = useCallback(
    (line: HTMLDivElement) => {
      const probe = sample.current;
      const after = text.current;
      if (!probe || !after) {
        return undefined;
      }
      const measure = () =>
        onMeasure(
          probe.getBoundingClientRect().width / wrapSample.length,
          fontOf(probe),
          wordPadding(
            line.getBoundingClientRect(),
            after.getBoundingClientRect(),
            devicePixelRatio,
          ),
          devicePixelRatio,
          lineHeightOf(line),
          spacingOf(probe),
        );
      measure();
      const stopWatching = watchDevicePixels(measure);
      const observer = new ResizeObserver(measure);
      observer.observe(probe);
      return () => {
        observer.disconnect();
        stopWatching();
      };
    },
    [onMeasure],
  );
  return (
    <div className="wrap-probe" aria-hidden>
      <div className="diff-line" ref={observe}>
        <span className="code">
          <span className="wrap-sample" ref={sample}>
            {wrapSample}
          </span>
          <span ref={text}>{wrapSample}</span>
        </span>
      </div>
    </div>
  );
});

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
