import type { ChangeDesc, StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

export interface EditorPlace {
  readonly from: number;
  readonly offset: number;
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
  return placeNumber(from) && placeNumber(offset)
    ? { from, offset }
    : undefined;
}

export function placeMapped(
  place: EditorPlace,
  changes: ChangeDesc,
): EditorPlace {
  return { ...place, from: changes.mapPos(place.from) };
}

export function placeOf(view: EditorView): EditorPlace {
  const height = view.scrollDOM.getBoundingClientRect().top - view.documentTop;
  const { from, top } = view.lineBlockAtHeight(height);
  return { from, offset: Math.max(0, height - top) };
}

export function backTo(
  view: EditorView,
  { from, offset }: EditorPlace,
): StateEffect<unknown> {
  return EditorView.scrollIntoView(Math.min(from, view.state.doc.length), {
    y: 'start',
    yMargin: view.defaultLineHeight / 2 - offset,
  });
}
