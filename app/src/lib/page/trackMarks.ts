import type { CSSProperties } from 'react';

export interface ScrollbarMark {
  readonly kind: string;
  readonly top: number;
  readonly height: number;
}

export interface MarkPlace extends CSSProperties {
  readonly '--mark-top': string;
  readonly '--mark-height': string;
}

const percent = (value: number) => `${value * 100}%`;

export const markClassOf = ({ kind }: ScrollbarMark): string =>
  `scrollbar-mark ${kind}`;

export const markPlaceOf = (mark: ScrollbarMark, scale = 1): MarkPlace => ({
  '--mark-top': percent(mark.top * scale),
  '--mark-height': percent(mark.height * scale),
});

export function paintMarks(
  box: HTMLElement,
  marks: readonly ScrollbarMark[],
  scale = 1,
): void {
  box.replaceChildren(
    ...marks.map((mark) => {
      const element = document.createElement('div');
      element.className = markClassOf(mark);
      const place = markPlaceOf(mark, scale);
      element.style.setProperty('--mark-top', place['--mark-top']);
      element.style.setProperty('--mark-height', place['--mark-height']);
      return element;
    }),
  );
}
