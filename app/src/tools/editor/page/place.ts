import { gridOf } from './grid';
import { placeOf as rowOn } from '../../../components/editing/page/rowSteps';
import {
  EditorSelection,
  type ChangeDesc,
  type EditorState,
  type StateEffect,
  type Text,
} from '@codemirror/state';
import type { CellTable } from '../../../lib/page/cellTable';
import { cursorMargin, EditorSurface, revealed } from './surface';

export interface EditorPlace {
  readonly from: number;
  readonly offset: number;
  readonly left?: number;
}

const placeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function placeIn(kept: unknown): EditorPlace | undefined {
  const place: unknown =
    typeof kept === 'object' && kept !== null
      ? Reflect.get(kept, 'place')
      : undefined;
  if (typeof place !== 'object' || place === null) {
    return undefined;
  }
  const from: unknown = Reflect.get(place, 'from');
  const offset: unknown = Reflect.get(place, 'offset');
  const left: unknown = Reflect.get(place, 'left');
  return placeNumber(from) && placeNumber(offset)
    ? { from, offset, ...(placeNumber(left) && left > 0 && { left }) }
    : undefined;
}

export function placeMapped(
  place: EditorPlace,
  changes: ChangeDesc,
): EditorPlace {
  return { ...place, from: changes.mapPos(place.from) };
}

export function placeOf(view: EditorSurface): EditorPlace {
  const left = view.scrollDOM.scrollLeft;
  const scroller = view.scrollDOM.getBoundingClientRect();
  const height = scroller.top - view.documentTop;
  const { from, top } = view.lineBlockAtHeight(height);
  const place = { from, offset: Math.max(0, height - top) };
  return left > 0 ? { ...place, left } : place;
}

function scrolledTo(
  view: EditorSurface,
  { from, offset }: EditorPlace,
): number | undefined {
  const grid = gridOf(view);
  if (grid === undefined) {
    return undefined;
  }
  const { doc } = view.state;
  const line = doc.lineAt(Math.min(from, doc.length));
  const row =
    from <= line.from ? 0 : rowOn(grid, line, Math.min(from, line.to), 1).row;
  return view.lineBlockAt(line.from).top + row * grid.rowHeight + offset;
}

export function backTo(
  doc: Text,
  { from, offset }: EditorPlace,
): StateEffect<unknown> {
  return revealed.of({
    range: EditorSelection.cursor(Math.min(from, doc.length)),
    x: 'nearest',
    y: 'start',
    xMargin: cursorMargin,
    yMargin: -offset,
  });
}

const framesWaited = 120;

export function editorAt(
  parent: HTMLElement,
  state: EditorState,
  table: CellTable,
  back: EditorPlace | undefined,
  onShown: () => void,
): { readonly view: EditorSurface; readonly stop: () => void } {
  const view = new EditorSurface(parent, state, table);
  if (back === undefined) {
    return { view, stop: () => {} };
  }
  let frame = 0;
  let waited = 0;
  let stopped = false;
  const place = (): void => {
    if (stopped) {
      return;
    }
    const target = scrolledTo(view, back);
    if (target === undefined && waited < framesWaited) {
      waited += 1;
      frame = requestAnimationFrame(() => view.requestMeasure(placing));
      return;
    }
    if (target !== undefined) {
      view.scrollDOM.scrollTop = target;
      view.scrollDOM.scrollLeft = back.left ?? 0;
    }
    stopped = true;
    onShown();
  };
  const placing = { read: () => undefined, write: place };
  view.requestMeasure(placing);
  return {
    view,
    stop: () => {
      stopped = true;
      cancelAnimationFrame(frame);
    },
  };
}
