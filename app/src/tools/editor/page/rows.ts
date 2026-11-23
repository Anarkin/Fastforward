import type { EditorView } from '@codemirror/view';
import { boxColumns } from '../../../lib/page/wrapBox';

const onPixel = 1e-6;

export function textAdvance(view: EditorView): number {
  const pixel = 1 / devicePixelRatio;
  return Math.round(view.defaultCharacterWidth / pixel + onPixel) * pixel;
}

export const wrapColumnsOf = (view: EditorView): number =>
  boxColumns(view.contentDOM, textAdvance(view));

export const scrolledAcross = (view: EditorView): number =>
  view.lineWrapping
    ? 0
    : Math.round(view.scrollDOM.scrollLeft * devicePixelRatio);

export function textStart(view: EditorView): number {
  const across = view.lineWrapping ? 0 : view.scrollDOM.scrollLeft;
  return (
    (view.contentDOM.getBoundingClientRect().left +
      parseFloat(getComputedStyle(view.contentDOM).paddingLeft) +
      across) *
    devicePixelRatio
  );
}

export const textLeft = (view: EditorView): number =>
  (textStart(view) - scrolledAcross(view)) / devicePixelRatio;

export function layerOrigin(view: EditorView): { left: number; top: number } {
  const rect = view.scrollDOM.getBoundingClientRect();
  return {
    left: rect.left - view.scrollDOM.scrollLeft * view.scaleX,
    top: rect.top - view.scrollDOM.scrollTop * view.scaleY,
  };
}
