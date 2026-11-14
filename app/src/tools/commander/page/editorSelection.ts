import {
  EditorSelection,
  findClusterBreak,
  Prec,
  type Extension,
  type SelectionRange,
} from '@codemirror/state';
import {
  EditorView,
  layer,
  RectangleMarker,
  type LayerMarker,
} from '@codemirror/view';
import type { CursorLook } from '../../../lib/shared/cursorSettings';
import type { Binding } from '../../../lib/shared/keymap';
import {
  blinkAnimation,
  drawnCursor,
  paintCursor,
  sameDrawing,
  type Box,
  type DrawnCursor,
} from '../../../lib/page/cursor';
import { keyPressed } from '../../../lib/page/shortcuts';

interface Span {
  readonly left: number;
  readonly width: number | null;
}

export function clampedToEdge(span: Span, edge: number | undefined): Span {
  if (edge === undefined) {
    return span;
  }
  const left = Math.min(span.left, edge);
  if (span.width === null) {
    return { left, width: null };
  }
  return {
    left,
    width: Math.max(0, Math.min(span.left + span.width, edge) - left),
  };
}

function rowEdge(view: EditorView): number | undefined {
  if (!view.lineWrapping) {
    return undefined;
  }
  const line = view.contentDOM.querySelector('.cm-line');
  const padding =
    line === null ? 0 : parseFloat(getComputedStyle(line).paddingRight);
  return view.contentDOM.getBoundingClientRect().right - padding;
}

function clampedMarkers(
  view: EditorView,
  className: string,
  range: SelectionRange,
): RectangleMarker[] {
  const right = rowEdge(view);
  const edge = right === undefined ? undefined : right - layerOrigin(view).left;
  return RectangleMarker.forRange(view, className, range).map((marker) => {
    const { left, width } = clampedToEdge(marker, edge);
    return left === marker.left && width === marker.width
      ? marker
      : new RectangleMarker(className, left, marker.top, width, marker.height);
  });
}

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

interface Character {
  readonly left: number;
  readonly right: number;
  readonly glyph: Box;
  readonly text: string;
  readonly font: string;
}

function characterAt(
  view: EditorView,
  pos: number,
  middle: number,
  rowHeight: number,
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
    glyph: {
      left: rect.left,
      top: rect.top,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
    },
    text,
    font: holder === null ? '' : getComputedStyle(holder).font,
  };
}

function cellAt(view: EditorView, range: SelectionRange): CursorCell | null {
  const { head } = range;
  const at = view.coordsAtPos(head, range.assoc || 1);
  if (at === null) {
    return null;
  }
  const rowHeight = parseFloat(getComputedStyle(view.contentDOM).lineHeight);
  const lineTop = view.documentTop + view.lineBlockAt(head).top;
  const middle = (at.top + at.bottom) / 2;
  const row = Math.floor((middle - lineTop) / rowHeight);
  const top = lineTop + Math.max(0, row) * rowHeight;
  const advance = view.defaultCharacterWidth;
  const of = (left: number, width: number, under: Character | null) => ({
    cell: { left, top, width, height: rowHeight },
    text: under?.text ?? '',
    font: under?.font,
    glyphBox: under?.glyph,
  });
  const under = characterAt(view, head, middle, rowHeight);
  const left = under?.left ?? at.left;
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

export function layerOrigin(view: EditorView): { left: number; top: number } {
  const rect = view.scrollDOM.getBoundingClientRect();
  return {
    left: rect.left - view.scrollDOM.scrollLeft * view.scaleX,
    top: rect.top - view.scrollDOM.scrollTop * view.scaleY,
  };
}

function cursorMarkers(view: EditorView, look: CursorLook): LayerMarker[] {
  const origin = layerOrigin(view);
  const shape = view.hasFocus ? look.style : 'outline';
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
              shape,
              barWidth: look.barWidth,
              ratio: devicePixelRatio,
              origin,
            }),
          ),
        ];
  });
}

function blinking(look: CursorLook, view: EditorView, again: boolean): string {
  return look.blink && view.hasFocus ? blinkAnimation(again) : 'none';
}

function cursorLayer(look: CursorLook): Extension {
  return layer({
    above: true,
    class: 'cm-cursorLayer',
    markers: (view) => cursorMarkers(view, look),
    mount(dom, view) {
      dom.style.animation = blinking(look, view, false);
    },
    update(update, dom) {
      if (
        update.focusChanged ||
        update.transactions.some((transaction) => transaction.selection)
      ) {
        dom.style.animation = blinking(
          look,
          update.view,
          dom.style.animationName === 'cursor-blink',
        );
      }
      return update.docChanged || update.selectionSet || update.focusChanged;
    },
  });
}

const selectionLayer = layer({
  above: false,
  class: 'cm-selectionLayer',
  markers: (view) =>
    view.state.selection.ranges
      .filter((range) => !range.empty)
      .flatMap((range) =>
        clampedMarkers(view, 'cm-selectionBackground', range),
      ),
  update: (update) =>
    update.docChanged || update.selectionSet || update.viewportChanged,
});

const hangingBlank = /[ \t　]/;

function rowEnd(view: EditorView, start: SelectionRange): SelectionRange {
  const end = view.moveToLineBoundary(start, true);
  if (!view.lineWrapping) {
    return end;
  }
  const line = view.state.doc.lineAt(end.head);
  let after = end.head;
  while (after < line.to && hangingBlank.test(line.text[after - line.from])) {
    after++;
  }
  if (after === end.head) {
    return end;
  }
  if (after === line.to) {
    return EditorSelection.cursor(after, -1);
  }
  const here = view.coordsAtPos(end.head, -1);
  const next = view.coordsAtPos(after, 1);
  return here !== null &&
    next !== null &&
    next.top > (here.top + here.bottom) / 2
    ? EditorSelection.cursor(after, -1)
    : end;
}

function moved(
  view: EditorView,
  move: (range: SelectionRange) => SelectionRange,
): boolean {
  const { selection } = view.state;
  const next = EditorSelection.create(
    selection.ranges.map(move),
    selection.mainIndex,
  );
  if (!next.eq(selection, true)) {
    view.dispatch({
      selection: next,
      scrollIntoView: true,
      userEvent: 'select',
    });
  }
  return true;
}

type RowEnd = 'move' | 'select';

function toRowEnd(view: EditorView, how: RowEnd): boolean {
  return moved(view, (range) => {
    const end = rowEnd(view, range);
    return how === 'move'
      ? end
      : EditorSelection.range(
          range.anchor,
          end.head,
          end.goalColumn,
          end.bidiLevel ?? undefined,
          end.assoc,
        );
  });
}

export function appSelection(
  rowEndKeys: Binding<RowEnd>,
  look: CursorLook,
): Extension {
  return [
    EditorView.editorAttributes.of({ class: 'editor-selection' }),
    EditorView.scrollMargins.of((view) => ({
      right: view.defaultCharacterWidth,
    })),
    cursorLayer(look),
    selectionLayer,
    Prec.high(
      EditorView.domEventHandlers({
        keydown(event, view) {
          const how = keyPressed(rowEndKeys, event);
          if (how === undefined) {
            return false;
          }
          event.preventDefault();
          return toRowEnd(view, how);
        },
      }),
    ),
  ];
}
