import { imageType } from '../../../lib/shared/images';
import { isPdf } from '../shared/pdf';
import { languageOf } from '../../../lib/page/languages';
import { viewedFileUrl } from '../shared/files';
import type { ViewMode } from './keymap';
import type { Viewing } from './commanderState';

export type Preview = 'image' | 'markdown' | 'pdf';

export function previewOf(file: string): Preview | undefined {
  if (imageType(file) !== undefined) {
    return 'image';
  }
  if (isPdf(file)) {
    return 'pdf';
  }
  return languageOf(file) === 'markdown' ? 'markdown' : undefined;
}

export function firstMode(file: string): ViewMode {
  return previewOf(file) === undefined ? 'text' : 'preview';
}

export function previewUrl(viewing: Viewing, file: string): string {
  return viewedFileUrl(viewing.tab, file, viewing.version);
}

interface ImageScroller {
  readonly scrollTop: number;
  readonly scrollLeft: number;
  readonly scrollHeight: number;
  readonly scrollWidth: number;
  readonly clientHeight: number;
  readonly clientWidth: number;
}

export type ImageStep =
  'up' | 'down' | 'pageUp' | 'pageDown' | 'first' | 'last' | -1 | 1;

const imageStepPixels = 40;

const within = (value: number, most: number) =>
  Math.min(Math.max(0, value), Math.max(0, most));

export function imageScrolled(
  scroller: ImageScroller,
  step: ImageStep,
): { readonly top: number; readonly left: number } {
  const page = Math.max(
    imageStepPixels,
    scroller.clientHeight - imageStepPixels,
  );
  const by: Readonly<Record<ImageStep, readonly [number, number]>> = {
    up: [-imageStepPixels, 0],
    down: [imageStepPixels, 0],
    pageUp: [-page, 0],
    pageDown: [page, 0],
    first: [-scroller.scrollHeight, 0],
    last: [scroller.scrollHeight, 0],
    [-1]: [0, -imageStepPixels],
    1: [0, imageStepPixels],
  };
  const [down, right] = by[step];
  return {
    top: within(
      scroller.scrollTop + down,
      scroller.scrollHeight - scroller.clientHeight,
    ),
    left: within(
      scroller.scrollLeft + right,
      scroller.scrollWidth - scroller.clientWidth,
    ),
  };
}
