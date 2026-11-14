import type {
  ChangeDesc,
  EditorState,
  StateEffect,
  Text,
} from '@codemirror/state';
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
  const scroller = view.scrollDOM.getBoundingClientRect();
  const height = scroller.top - view.documentTop;
  const { from, top } = view.lineBlockAtHeight(height);
  const offset = Math.max(0, height - top);
  if (offset < view.defaultLineHeight) {
    return { from, offset };
  }
  const row = view.posAtCoords(
    {
      x: view.contentDOM.getBoundingClientRect().left + 1,
      y: scroller.top + view.defaultLineHeight / 2,
    },
    false,
  );
  return { from: row, offset: 0 };
}

function backTo(
  doc: Text,
  { from, offset }: EditorPlace,
): StateEffect<unknown> {
  return EditorView.scrollIntoView(Math.min(from, doc.length), {
    y: 'start',
    yMargin: -offset,
  });
}

const settleChecks = 30;
const settleTries = 3;
const userInputs = ['wheel', 'keydown', 'pointerdown'] as const;

export function samePlace(one: EditorPlace, other: EditorPlace): boolean {
  return one.from === other.from && Math.abs(one.offset - other.offset) < 1;
}

function shownWhenBack(
  view: EditorView,
  wanted: EditorPlace,
  onShown: () => void,
): () => void {
  const scroller = view.scrollDOM;
  scroller.style.opacity = '0';
  const channel = new MessageChannel();
  let frame = 0;
  let checks = 0;
  let tries = 0;
  let last = '';
  const stop = () => {
    cancelAnimationFrame(frame);
    channel.port1.close();
    for (const input of userInputs) {
      view.dom.removeEventListener(input, interrupted, true);
    }
    scroller.style.opacity = '';
  };
  const interrupted = () => {
    stop();
    onShown();
  };
  for (const input of userInputs) {
    view.dom.addEventListener(input, interrupted, true);
  }
  const next = () => {
    frame = requestAnimationFrame(() => channel.port2.postMessage(undefined));
  };
  channel.port1.addEventListener('message', () => {
    checks += 1;
    const now = placeOf(view);
    const seen = JSON.stringify([scroller.scrollTop, now]);
    const settled = seen === last;
    last = seen;
    if ((settled && samePlace(now, wanted)) || checks > settleChecks) {
      interrupted();
      return;
    }
    if (settled && tries < settleTries) {
      tries += 1;
      view.dispatch({ effects: backTo(view.state.doc, wanted) });
    }
    next();
  });
  channel.port1.start();
  next();
  return stop;
}

export function editorAt(
  parent: HTMLElement,
  state: EditorState,
  back: EditorPlace | undefined,
  onShown: () => void,
): { readonly view: EditorView; readonly stop: () => void } {
  const view = new EditorView({
    parent,
    state,
    scrollTo: back === undefined ? undefined : backTo(state.doc, back),
  });
  return {
    view,
    stop: back === undefined ? () => {} : shownWhenBack(view, back, onShown),
  };
}
