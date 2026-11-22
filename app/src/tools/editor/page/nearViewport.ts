import type { Extension } from '@codemirror/state';
import { ViewPlugin } from '@codemirror/view';
import { scrollbarHeldAttribute } from '../../../lib/page/scrollbars';

const drawnAround = 1000;

const drawnAroundHeld = 100;

const coveredAhead = drawnAround / 4;

interface Seen {
  readonly top: number;
  readonly bottom: number;
}

export function seenForMargin<Kept extends Seen>(
  seen: Kept,
  bias: number,
  margin: number,
): Kept {
  const above = 0.5 - Math.max(-0.5, Math.min(0.5, bias / drawnAround / 2));
  const less = drawnAround - margin;
  return {
    ...seen,
    top: seen.top + above * less,
    bottom: seen.bottom - (1 - above) * less,
  };
}

interface Move {
  readonly top: number;
  readonly step: number;
}

export function moveTo(last: Move | undefined, top: number): Move {
  return last === undefined
    ? { top, step: 0 }
    : last.top === top
      ? last
      : { top, step: Math.abs(top - last.top) };
}

const isSeen = (value: unknown): value is Seen =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'top') === 'number' &&
  typeof Reflect.get(value, 'bottom') === 'number';

const scrollers = new WeakMap<object, Element>();

const moves = new WeakMap<object, Move>();

const drawnNear = new WeakSet<object>();

const patched = new WeakSet<object>();

const held = (viewState: object): boolean =>
  scrollers.get(viewState)?.getAttribute(scrollbarHeldAttribute) ===
  'vertical-thumb';

function stepOf(viewState: object): number {
  const seen: unknown = Reflect.get(viewState, 'pixelViewport');
  if (!isSeen(seen)) {
    return 0;
  }
  const move = moveTo(moves.get(viewState), seen.top);
  moves.set(viewState, move);
  return move.step;
}

function patch(shared: object): void {
  const viewport: unknown = Reflect.get(shared, 'getViewport');
  const appropriate: unknown = Reflect.get(shared, 'viewportIsAppropriate');
  if (
    patched.has(shared) ||
    typeof viewport !== 'function' ||
    typeof appropriate !== 'function'
  ) {
    return;
  }
  patched.add(shared);
  Reflect.set(
    shared,
    'getViewport',
    function viewportNear(this: object, ...asked: unknown[]): unknown {
      const [bias, target] = asked;
      const seen: unknown = Reflect.get(this, 'pixelViewport');
      const step = stepOf(this);
      if (
        !held(this) ||
        step <= coveredAhead ||
        typeof bias !== 'number' ||
        (target !== null && target !== undefined) ||
        !isSeen(seen)
      ) {
        drawnNear.delete(this);
        return Reflect.apply(viewport, this, asked);
      }
      drawnNear.add(this);
      Reflect.set(
        this,
        'pixelViewport',
        seenForMargin(seen, bias, drawnAroundHeld),
      );
      try {
        return Reflect.apply(viewport, this, asked);
      } finally {
        Reflect.set(this, 'pixelViewport', seen);
      }
    },
  );
  Reflect.set(
    shared,
    'viewportIsAppropriate',
    function appropriateOnceLetGo(this: object, ...asked: unknown[]): unknown {
      stepOf(this);
      return drawnNear.has(this) && !held(this)
        ? false
        : Reflect.apply(appropriate, this, asked);
    },
  );
}

interface HeldView {
  readonly scrollDOM: Element;
  requestMeasure(): void;
}

function viewStateOf(view: HeldView): object | undefined {
  const viewState: unknown = Reflect.get(view, 'viewState');
  return typeof viewState === 'object' && viewState !== null
    ? viewState
    : undefined;
}

export function drawNearWhileHeld(view: HeldView): () => void {
  const viewState = viewStateOf(view);
  const shared: unknown =
    viewState === undefined ? undefined : Object.getPrototypeOf(viewState);
  const Observer = view.scrollDOM.ownerDocument.defaultView?.MutationObserver;
  if (
    viewState === undefined ||
    typeof shared !== 'object' ||
    shared === null ||
    Observer === undefined
  ) {
    return () => {};
  }
  patch(shared);
  scrollers.set(viewState, view.scrollDOM);
  const letGo = new Observer(() => {
    const now = viewStateOf(view);
    if (now !== undefined && drawnNear.has(now) && !held(now)) {
      view.requestMeasure();
    }
  });
  letGo.observe(view.scrollDOM, { attributeFilter: [scrollbarHeldAttribute] });
  return () => letGo.disconnect();
}

export const drawnNearWhileHeld: Extension = ViewPlugin.define((view) => ({
  destroy: drawNearWhileHeld(view),
}));
