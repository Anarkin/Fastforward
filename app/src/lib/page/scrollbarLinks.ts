export type ScrollbarDrag = 'thumb' | 'track';

export const scrollbarDrags = new WeakMap<Element, ScrollbarDrag>();

export interface HeldScroller {
  readonly dragTo: (place: number) => void;
  readonly dragEnd: () => void;
  readonly stepBy?: (steps: number) => void;
}

type Wheeled = (event: WheelEvent) => void;

const wheeled = new WeakMap<Element, Map<string, Wheeled>>();

export function setWheeled(
  element: Element,
  along: 'rows' | 'columns',
  turn: Wheeled | undefined,
): void {
  const turns = wheeled.get(element) ?? new Map<string, Wheeled>();
  if (turn) {
    turns.set(along, turn);
  } else {
    turns.delete(along);
  }
  wheeled.set(element, turns);
}

const stoodFor = new WeakMap<Element, Element>();

export function setStoodFor(standIn: Element, view: Element | undefined): void {
  if (view) {
    stoodFor.set(standIn, view);
  } else {
    stoodFor.delete(standIn);
  }
}

export function wheeledAround(element: Element): Wheeled[] {
  const found: Wheeled[] = [];
  for (
    let at: Element | null = stoodFor.get(element) ?? element;
    at !== null;
    at = at.parentElement
  ) {
    const turns = wheeled.get(at);
    found.push(
      ...(turns
        ? ['rows', 'columns'].flatMap((along) => turns.get(along) ?? [])
        : []),
    );
  }
  return found;
}

const columnScrollers = new WeakMap<Element, HeldScroller>();

export function setColumnScroller(
  element: Element,
  scroller: HeldScroller | undefined,
): void {
  if (scroller) {
    columnScrollers.set(element, scroller);
  } else {
    columnScrollers.delete(element);
  }
}

export function columnScrollerOf(element: Element): HeldScroller | undefined {
  return columnScrollers.get(element);
}

const rowScrollers = new WeakMap<Element, HeldScroller>();

export function setRowScroller(
  element: Element,
  scroller: HeldScroller | undefined,
): void {
  if (scroller) {
    rowScrollers.set(element, scroller);
  } else {
    rowScrollers.delete(element);
  }
}

export function rowScrollerOf(element: Element): HeldScroller | undefined {
  return rowScrollers.get(element);
}
