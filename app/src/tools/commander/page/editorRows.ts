import { findClusterBreak } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { Box } from '../../../lib/page/cursor';

export function rowEdge(view: EditorView): number | undefined {
  if (!view.lineWrapping) {
    return undefined;
  }
  const line = view.contentDOM.querySelector('.cm-line');
  const padding =
    line === null ? 0 : parseFloat(getComputedStyle(line).paddingRight);
  return view.contentDOM.getBoundingClientRect().right - padding;
}

export interface Character {
  readonly left: number;
  readonly right: number;
  readonly middle: number;
  readonly glyph: Box;
  readonly text: string;
  readonly font: string;
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
  const text = view.state.doc.sliceString(pos, end);
  const rect = text === '\t' ? null : view.coordsForChar(pos);
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
