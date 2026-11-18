import { snapOffset } from '../../../lib/page/devicePixels';
import { codePadding } from './textLayout';

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
      row?.querySelector('.split-code'),
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
