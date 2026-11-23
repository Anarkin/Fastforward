import {
  findClusterBreak,
  type Extension,
  type SelectionRange,
} from '@codemirror/state';
import { layer, type EditorView, type LayerMarker } from '@codemirror/view';
import type { CursorLook } from '../../../lib/shared/cursorSettings';
import {
  blinkAnimation,
  drawnCursor,
  paintCursor,
  sameDrawing,
  type DrawnCursor,
} from '../../../lib/page/cursor';
import type { Box } from '../../../lib/page/pixelBoxes';
import { pictured } from '../../../lib/page/controlPictures';
import { cellAt, gridOf, type Grid } from './grid';
import { layerOrigin } from './rows';

class CursorMarker implements LayerMarker {
  constructor(
    private readonly className: string,
    private readonly drawn: DrawnCursor,
  ) {}

  draw(): HTMLElement {
    const element = document.createElement('div');
    element.className = this.className;
    paintCursor(element, this.drawn);
    return element;
  }

  update(element: HTMLElement, previous: LayerMarker): boolean {
    if (
      !(previous instanceof CursorMarker) ||
      previous.className !== this.className
    ) {
      return false;
    }
    paintCursor(element, this.drawn);
    return true;
  }

  eq(other: LayerMarker): boolean {
    return (
      other instanceof CursorMarker &&
      other.className === this.className &&
      sameDrawing(other.drawn, this.drawn)
    );
  }
}

interface CursorCell {
  readonly cell: Box;
  readonly text: string;
  readonly font: string;
}

function cursorCell(
  view: EditorView,
  grid: Grid,
  font: string,
  range: SelectionRange,
): CursorCell {
  const { head } = range;
  const line = view.state.doc.lineAt(head);
  const char = head - line.from;
  const text =
    char >= line.length
      ? ''
      : line.text.slice(char, findClusterBreak(line.text, char, true));
  return {
    cell: cellAt(view, grid, head, range.assoc || 1),
    text: text === '\t' ? '' : pictured(text),
    font,
  };
}

function cursorMarkers(view: EditorView, look: CursorLook): LayerMarker[] {
  const grid = gridOf(view);
  if (grid === undefined) {
    return [];
  }
  const origin = layerOrigin(view);
  const font = getComputedStyle(view.contentDOM).font;
  const { selection } = view.state;
  return selection.ranges.map(
    (range) =>
      new CursorMarker(
        range === selection.main
          ? 'cm-cursor cm-cursor-primary'
          : 'cm-cursor cm-cursor-secondary',
        drawnCursor({
          ...cursorCell(view, grid, font, range),
          shape: look.style,
          thickness: look.width,
          ratio: devicePixelRatio,
          origin,
        }),
      ),
  );
}

function blinking(look: CursorLook, again: boolean): string {
  return look.blink ? blinkAnimation(again) : 'none';
}

export function cursorLayer(look: CursorLook): Extension {
  return layer({
    above: true,
    class: 'cm-cursorLayer',
    markers: (view) => cursorMarkers(view, look),
    mount(dom) {
      dom.style.animation = blinking(look, false);
    },
    update(update, dom) {
      if (update.transactions.some((transaction) => transaction.selection)) {
        dom.style.animation = blinking(
          look,
          dom.style.animationName === 'cursor-blink',
        );
      }
      return update.docChanged || update.selectionSet;
    },
  });
}
