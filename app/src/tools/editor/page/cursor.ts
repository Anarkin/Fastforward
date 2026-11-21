import { lineHeightOf } from '../../../lib/page/lineHeight';
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
import { characterAt, layerOrigin, rowEdge, type Character } from './rows';

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
  readonly font: string | undefined;
  readonly glyphBox: Box | undefined;
}

function rightOfCharacterBefore(
  view: EditorView,
  pos: number,
  middle: number,
  rowHeight: number,
): number | undefined {
  const line = view.state.doc.lineAt(pos);
  if (pos <= line.from) {
    return undefined;
  }
  const from = line.from + findClusterBreak(line.text, pos - line.from, false);
  return characterAt(view, from, middle, rowHeight, false)?.right;
}

function cellAt(view: EditorView, range: SelectionRange): CursorCell | null {
  const { head } = range;
  const at = view.coordsAtPos(head, range.assoc || 1);
  if (at === null) {
    return null;
  }
  const rowHeight = lineHeightOf(
    view.contentDOM,
    view.defaultLineHeight,
    devicePixelRatio,
  );
  const middle = (at.top + at.bottom) / 2;
  const advance = view.defaultCharacterWidth;
  const under = characterAt(view, head, middle, rowHeight);
  const top = (under?.middle ?? middle) - rowHeight / 2;
  const of = (left: number, width: number, shown: Character | null) => ({
    cell: { left, top, width, height: rowHeight },
    text: shown?.text ?? '',
    font: shown?.font,
    glyphBox: shown?.glyph,
  });
  const left =
    under?.left ??
    rightOfCharacterBefore(view, head, middle, rowHeight) ??
    at.left;
  const width = under === null ? advance : under.right - under.left;
  const edge = rowEdge(view);
  if (edge === undefined || left + width <= edge + 0.5) {
    return of(left, width, under);
  }
  const last = view.posAtCoords({ x: edge - advance / 2, y: middle }, false);
  const inside = characterAt(view, last, middle, rowHeight);
  return inside !== null && inside.right <= edge + 0.5
    ? of(inside.left, inside.right - inside.left, inside)
    : of(edge - advance, advance, null);
}

function cursorMarkers(view: EditorView, look: CursorLook): LayerMarker[] {
  const origin = layerOrigin(view);
  const { selection } = view.state;
  return selection.ranges.flatMap((range) => {
    const found = cellAt(view, range);
    return found === null
      ? []
      : [
          new CursorMarker(
            range === selection.main
              ? 'cm-cursor cm-cursor-primary'
              : 'cm-cursor cm-cursor-secondary',
            drawnCursor({
              ...found,
              shape: look.style,
              thickness: look.width,
              ratio: devicePixelRatio,
              origin,
            }),
          ),
        ];
  });
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
