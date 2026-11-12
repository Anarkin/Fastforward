import {
  EditorSelection,
  Prec,
  type Extension,
  type SelectionRange,
} from '@codemirror/state';
import { EditorView, layer, RectangleMarker } from '@codemirror/view';
import type { Binding } from '../shell/shared/keymap';
import { keyPressed } from './shortcuts';

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
  const scroller = view.scrollDOM.getBoundingClientRect();
  const base = scroller.left - view.scrollDOM.scrollLeft * view.scaleX;
  const line = view.contentDOM.querySelector('.cm-line');
  const padding =
    line === null ? 0 : parseFloat(getComputedStyle(line).paddingRight);
  return view.contentDOM.getBoundingClientRect().right - padding - base;
}

function clampedMarkers(
  view: EditorView,
  className: string,
  range: SelectionRange,
): RectangleMarker[] {
  const edge = rowEdge(view);
  return RectangleMarker.forRange(view, className, range).map((marker) => {
    const { left, width } = clampedToEdge(marker, edge);
    return left === marker.left && width === marker.width
      ? marker
      : new RectangleMarker(className, left, marker.top, width, marker.height);
  });
}

const cursorLayer = layer({
  above: true,
  class: 'cm-cursorLayer',
  markers: (view) =>
    view.state.selection.ranges.flatMap((range) =>
      clampedMarkers(
        view,
        range === view.state.selection.main
          ? 'cm-cursor cm-cursor-primary'
          : 'cm-cursor cm-cursor-secondary',
        range.empty ? range : EditorSelection.cursor(range.head, range.assoc),
      ),
    ),
  update(update, dom) {
    if (update.transactions.some((transaction) => transaction.selection)) {
      dom.style.animationName =
        dom.style.animationName === 'cm-blink' ? 'cm-blink2' : 'cm-blink';
    }
    return update.docChanged || update.selectionSet;
  },
});

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

export function appSelection(rowEndKeys: Binding<RowEnd>): Extension {
  return [
    EditorView.editorAttributes.of({ class: 'editor-selection' }),
    cursorLayer,
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
