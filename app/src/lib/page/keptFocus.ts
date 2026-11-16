import { useEffect, useEffectEvent, type RefObject } from 'react';
import { restoreWhen } from './restore';
import {
  count,
  oneOf,
  optional,
  record,
  text,
  type Schema,
} from '../shared/schema';

export const focusNameAttribute = 'data-focus-name';

export interface KeptFocus {
  readonly name: string;
  readonly selection?: readonly [
    start: number,
    end: number,
    direction: 'forward' | 'backward' | 'none',
  ];
  readonly scroll?: number;
}

export interface KeptTyped {
  readonly value: string;
  readonly selection?: KeptFocus['selection'];
}

interface TextField {
  readonly selectionStart: number | null;
  readonly selectionEnd: number | null;
  readonly selectionDirection: 'forward' | 'backward' | 'none' | null;
  setSelectionRange(
    start: number,
    end: number,
    direction?: 'forward' | 'backward' | 'none',
  ): void;
}

function isTextField(element: Element): element is Element & TextField {
  return (
    (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') &&
    'setSelectionRange' in element
  );
}

function selectionOf(element: Element): KeptFocus['selection'] {
  if (!isTextField(element)) {
    return undefined;
  }
  try {
    const { selectionStart, selectionEnd, selectionDirection } = element;
    return selectionStart === null || selectionEnd === null
      ? undefined
      : [selectionStart, selectionEnd, selectionDirection ?? 'none'];
  } catch {
    return undefined;
  }
}

export function focusOf(
  root: Element,
  focused: Element | null,
): KeptFocus | undefined {
  const part = focused?.closest(`[${focusNameAttribute}]`);
  if (focused == null || part == null || !root.contains(part)) {
    return undefined;
  }
  const name = part.getAttribute(focusNameAttribute) ?? '';
  const selection = selectionOf(focused);
  const scroll = isTextField(focused) ? focused.scrollLeft : 0;
  return {
    name,
    ...(selection !== undefined && { selection }),
    ...(scroll > 0 && { scroll }),
  };
}

const directions = ['forward', 'backward', 'none'] as const;

const place = count({ min: 0, integer: true });

const direction = oneOf(directions);

const caretSchema: Schema<NonNullable<KeptFocus['selection']>> = {
  decode: (value) => {
    if (!Array.isArray(value) || value.length !== 3) {
      return undefined;
    }
    const [start, end, way]: unknown[] = value;
    const from = place.decode(start);
    const to = place.decode(end);
    const toward = direction.decode(way);
    return from === undefined || to === undefined || toward === undefined
      ? undefined
      : [from, to, toward];
  },
  encode: ([start, end, way]) => [start, end, way],
};

export const typedSchema: Schema<KeptTyped> = record({
  value: text(),
  selection: optional(caretSchema),
});

export const focusSchema: Schema<KeptFocus> = record({
  name: text(),
  selection: optional(caretSchema),
  scroll: optional(count({ min: 1, integer: true })),
});

export function focusBack(root: Element, kept: KeptFocus | undefined): boolean {
  if (kept === undefined) {
    return false;
  }
  const part = [
    ...root.querySelectorAll<HTMLElement>(`[${focusNameAttribute}]`),
  ].find((each) => each.getAttribute(focusNameAttribute) === kept.name);
  if (part === undefined) {
    return false;
  }
  part.focus({ preventScroll: true });
  if (kept.selection !== undefined && isTextField(part)) {
    part.setSelectionRange(...kept.selection);
  }
  if (kept.scroll !== undefined && isTextField(part)) {
    scrolledBack(part, kept.scroll);
  }
  return part.ownerDocument.activeElement === part;
}

function scrolledBack(part: HTMLElement & TextField, scroll: number): void {
  const Observer = part.ownerDocument.defaultView?.ResizeObserver;
  restoreWhen(
    scroll,
    (wanted) => {
      part.scrollLeft = wanted;
      return part.scrollLeft >= wanted - 1;
    },
    () => undefined,
    {
      on: part,
      watch:
        Observer === undefined
          ? undefined
          : (check) => {
              const observer = new Observer(check);
              observer.observe(part);
              return () => observer.disconnect();
            },
    },
  );
}

const caretMoves = ['focusin', 'keyup', 'mouseup', 'input', 'select'] as const;

export function useFocusKeeper(
  root: RefObject<HTMLElement | null>,
  keep: (focus: KeptFocus | undefined) => void,
): void {
  const kept = useEffectEvent(() => {
    const element = root.current;
    if (element !== null) {
      keep(focusOf(element, element.ownerDocument.activeElement));
    }
  });
  useEffect(() => {
    const element = root.current;
    if (element === null) {
      return undefined;
    }
    const onMove = () => kept();
    for (const move of caretMoves) {
      element.addEventListener(move, onMove);
    }
    return () => {
      for (const move of caretMoves) {
        element.removeEventListener(move, onMove);
      }
    };
  }, [root]);
}
