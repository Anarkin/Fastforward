import { tabSize } from '../../../lib/page/tabStops';
import { codePadding, markerWidth, numberWidth } from './overflow';
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

export function sameTextMeasures(
  one: TextMeasures | undefined,
  other: TextMeasures,
): boolean {
  return (
    one !== undefined &&
    one.charWidth === other.charWidth &&
    one.font === other.font &&
    one.spacing === other.spacing &&
    one.scale === other.scale &&
    one.lineHeight === other.lineHeight &&
    one.padding.top === other.padding.top &&
    one.padding.bottom === other.padding.bottom
  );
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

export const layoutVariables: React.CSSProperties = {
  '--diff-file-height': 'var(--diff-line-height)',
  '--diff-tab-size': String(tabSize),
  '--diff-number-width': `${numberWidth}px`,
  '--diff-code-padding': `${codePadding}px`,
  '--diff-marker-width': `${markerWidth}px`,
};

export interface Edges {
  readonly top: number;
  readonly bottom: number;
}
