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
  pixelBox,
  placedBox,
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

export function nearestRowEdge(
  y: number,
  middle: number,
  rowHeight: number,
): number {
  const top = middle - rowHeight / 2;
  const bottom = middle + rowHeight / 2;
  return Math.abs(y - top) <= Math.abs(y - bottom) ? top : bottom;
}

function rowMiddleAt(
  view: EditorView,
  x: number,
  y: number,
  rowHeight: number,
): number | undefined {
  const pos = view.posAtCoords({ x, y }, false);
  const under = characterAt(view, pos, y, rowHeight, false);
  if (under !== null) {
    return under.middle;
  }
  for (const side of [1, -1] as const) {
    const at = view.coordsAtPos(pos, side);
    if (at !== null && Math.abs((at.top + at.bottom) / 2 - y) < rowHeight / 2) {
      return (at.top + at.bottom) / 2;
    }
  }
  return undefined;
}

function onRowEdge(
  view: EditorView,
  x: number,
  y: number,
  inward: number,
  rowHeight: number,
): number {
  const middle = rowMiddleAt(view, x, y + inward / 2, rowHeight);
  return middle === undefined ? y : nearestRowEdge(y, middle, rowHeight);
}

interface Measures {
  readonly origin: { readonly left: number; readonly top: number };
  readonly edge: number | undefined;
  readonly rowHeight: number;
  readonly ratio: number;
}

function measuresOf(view: EditorView): Measures {
  const origin = layerOrigin(view);
  const right = rowEdge(view);
  return {
    origin,
    edge: right === undefined ? undefined : right - origin.left,
    rowHeight: parseFloat(getComputedStyle(view.contentDOM).lineHeight),
    ratio: devicePixelRatio,
  };
}

function cellSide(x: number, y: number, side: 'left' | 'right') {
  const cell = document
    .elementsFromPoint(x, y)
    .find((element) => element.classList.contains('cell'));
  return cell?.getBoundingClientRect()[side];
}

function clampedMarkers(
  view: EditorView,
  className: string,
  range: SelectionRange,
  { origin, edge, rowHeight, ratio }: Measures,
): RectangleMarker[] {
  return RectangleMarker.forRange(view, className, range).map((marker) => {
    const { left, width } = clampedToEdge(marker, edge);
    const x = origin.left + left + Math.min(1, (width ?? 0) / 2);
    const top = onRowEdge(view, x, origin.top + marker.top, 1, rowHeight);
    const bottom = onRowEdge(
      view,
      x,
      origin.top + marker.top + marker.height,
      -1,
      rowHeight,
    );
    const from = origin.left + left;
    const to = from + (width ?? 0);
    const snapped =
      width === null || width <= 0
        ? { from, to }
        : {
            from: cellSide(from + 0.5, top + rowHeight / 2, 'left') ?? from,
            to: Math.min(
              cellSide(to - 0.5, bottom - rowHeight / 2, 'right') ?? to,
              edge === undefined ? Infinity : origin.left + edge,
            ),
          };
    const placed = placedBox(
      pixelBox(
        {
          left: snapped.from,
          top,
          width: Math.max(0, snapped.to - snapped.from),
          height: Math.max(0, bottom - top),
        },
        ratio,
      ),
      ratio,
      origin,
    );
    return new RectangleMarker(
      className,
      placed.left,
      placed.top,
      width === null ? null : placed.width,
      placed.height,
    );
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
  readonly middle: number;
  readonly glyph: Box;
  readonly text: string;
  readonly font: string;
}

function characterAt(
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

function cellAt(view: EditorView, range: SelectionRange): CursorCell | null {
  const { head } = range;
  const at = view.coordsAtPos(head, range.assoc || 1);
  if (at === null) {
    return null;
  }
  const rowHeight = parseFloat(getComputedStyle(view.contentDOM).lineHeight);
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

function cursorLayer(look: CursorLook): Extension {
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

const selectionLayer = layer({
  above: false,
  class: 'cm-selectionLayer',
  markers: (view) => {
    const measures = measuresOf(view);
    return view.state.selection.ranges
      .filter((range) => !range.empty)
      .flatMap((range) =>
        clampedMarkers(view, 'cm-selectionBackground', range, measures),
      );
  },
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
