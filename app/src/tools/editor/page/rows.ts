import { findClusterBreak } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { Box } from '../../../lib/page/pixelBoxes';
import { boxColumns } from '../../../lib/page/wrapBox';
import { pictured } from '../../../lib/page/controlPictures';
import { picturedIn } from './pictures';

const onPixel = 1e-6;

function textAdvance(view: EditorView): number {
  const pixel = 1 / devicePixelRatio;
  return Math.round(view.defaultCharacterWidth / pixel + onPixel) * pixel;
}

export const wrapColumnsOf = (view: EditorView): number =>
  boxColumns(view.contentDOM, textAdvance(view));

export const textLeft = (view: EditorView): number =>
  view.contentDOM.getBoundingClientRect().left +
  parseFloat(getComputedStyle(view.contentDOM).paddingLeft);

export function rowEdge(view: EditorView): number | undefined {
  return view.lineWrapping
    ? textLeft(view) + (wrapColumnsOf(view) + 1) * textAdvance(view)
    : undefined;
}

export interface Character {
  readonly left: number;
  readonly right: number;
  readonly middle: number;
  readonly glyph: Box;
  readonly text: string;
  readonly font: string;
}

function replacedRect(
  view: EditorView,
  from: number,
  to: number,
): { left: number; right: number; top: number; bottom: number } | null {
  const start = view.coordsAtPos(from, 1);
  const end = view.coordsAtPos(to, -1);
  return start === null || end === null
    ? null
    : {
        left: start.left,
        right: end.right,
        top: start.top,
        bottom: start.bottom,
      };
}

export function characterAt(
  view: EditorView,
  pos: number,
  middle: number,
  rowHeight: number,
  withFont = true,
): Character | null {
  const line = view.state.doc.lineAt(pos);
  if (pos >= line.to) {
    return null;
  }
  const end = line.from + findClusterBreak(line.text, pos - line.from);
  const written = view.state.doc.sliceString(pos, end);
  const drawn = picturedIn(view, pos);
  const text = drawn ? pictured(written) : written;
  const rect =
    written === '\t'
      ? null
      : drawn
        ? replacedRect(view, pos, end)
        : view.coordsForChar(pos);
  if (
    rect === null ||
    rect.right <= rect.left ||
    Math.abs((rect.top + rect.bottom) / 2 - middle) >= rowHeight / 2
  ) {
    return null;
  }
  const { node } = view.domAtPos(pos, 1);
  const holder = node instanceof Element ? node : node.parentElement;
  const cell = holder?.closest('.cell')?.getBoundingClientRect() ?? rect;
  return {
    left: cell.left,
    right: cell.right,
    middle: (cell.top + cell.bottom) / 2,
    glyph: {
      left: rect.left,
      top: rect.top,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
    },
    text,
    font: holder === null || !withFont ? '' : getComputedStyle(holder).font,
  };
}

export function layerOrigin(view: EditorView): { left: number; top: number } {
  const rect = view.scrollDOM.getBoundingClientRect();
  return {
    left: rect.left - view.scrollDOM.scrollLeft * view.scaleX,
    top: rect.top - view.scrollDOM.scrollTop * view.scaleY,
  };
}
