import type { Extension, SelectionRange } from '@codemirror/state';
import { EditorView, layer, RectangleMarker } from '@codemirror/view';
import type { CursorLook } from '../../../lib/shared/cursorSettings';
import type { Binding } from '../../../lib/shared/keymap';
import { pixelBox, placedBox } from '../../../lib/page/cursor';
import { cursorLayer } from './editorCursor';
import { characterAt, layerOrigin, rowEdge } from './editorRows';
import { rowEndKeys, type RowEnd } from './editorRowEnd';

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

export function appSelection(
  binding: Binding<RowEnd>,
  look: CursorLook,
): Extension {
  return [
    EditorView.editorAttributes.of({ class: 'editor-selection' }),
    EditorView.scrollMargins.of((view) => ({
      right: view.defaultCharacterWidth,
    })),
    cursorLayer(look),
    selectionLayer,
    rowEndKeys(binding),
  ];
}
