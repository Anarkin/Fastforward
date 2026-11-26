import { onPixel } from '../../../lib/page/pixelBoxes';
import type { EditorSurface } from './surface';
import { boxColumns } from '../../../lib/page/wrapBox';

export function textAdvance(view: EditorSurface): number {
  const pixel = 1 / devicePixelRatio;
  return Math.round(view.defaultCharacterWidth / pixel + onPixel) * pixel;
}

export const wrapColumnsOf = (view: EditorSurface): number =>
  boxColumns(view.contentDOM, textAdvance(view));

export const scrolledAcross = (view: EditorSurface): number =>
  view.lineWrapping
    ? 0
    : Math.round(view.scrollDOM.scrollLeft * devicePixelRatio);

export function textStart(view: EditorSurface): number {
  const across = view.lineWrapping ? 0 : view.scrollDOM.scrollLeft;
  return (
    (view.contentDOM.getBoundingClientRect().left +
      parseFloat(getComputedStyle(view.contentDOM).paddingLeft) +
      across) *
    devicePixelRatio
  );
}

export const textLeft = (view: EditorSurface): number =>
  (textStart(view) - scrolledAcross(view)) / devicePixelRatio;

export function layerOrigin(view: EditorSurface): {
  left: number;
  top: number;
} {
  const rect = view.scrollDOM.getBoundingClientRect();
  return {
    left: rect.left - view.scrollDOM.scrollLeft,
    top: rect.top - view.scrollDOM.scrollTop,
  };
}
