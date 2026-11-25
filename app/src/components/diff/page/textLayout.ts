import { tabSizeOf } from '../../../lib/page/tabStops';
import type { WrapColumns } from './rowMeasures';

declare module 'react' {
  interface CSSProperties {
    readonly '--diff-file-height'?: string;
    readonly '--diff-row-top'?: string;
    readonly '--diff-tab-size'?: string;
    readonly '--diff-number-width'?: string;
    readonly '--diff-code-padding'?: string;
    readonly '--diff-snap-inline'?: string;
    readonly '--diff-snap-left'?: string;
    readonly '--diff-snap-right'?: string;
    readonly '--wrap-indent'?: string;
  }
}

export const numberWidth = 56;
export const codePadding = 6;

export const unmeasured: WrapColumns = { left: Infinity, right: Infinity };

export interface TextMeasures {
  readonly charWidth: number;
  readonly font: string;
  readonly spacing: number;
  readonly scale: number;
  readonly lineHeight: number;
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
    one.lineHeight === other.lineHeight
  );
}

export const layoutVariables = (): React.CSSProperties => ({
  '--diff-file-height': 'var(--diff-line-height)',
  '--diff-tab-size': String(tabSizeOf(undefined)),
  '--diff-number-width': `${numberWidth}px`,
  '--diff-code-padding': `${codePadding}px`,
});

export interface Edges {
  readonly top: number;
  readonly bottom: number;
}
