import { useEffect, useEffectEvent, type RefObject } from 'react';

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

function countFrom(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

export function keptFocusFrom(value: unknown): KeptFocus | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const name: unknown = Reflect.get(value, 'name');
  if (typeof name !== 'string') {
    return undefined;
  }
  const kept: unknown = Reflect.get(value, 'selection');
  const [start, end, way]: readonly unknown[] = Array.isArray(kept) ? kept : [];
  const from = countFrom(start);
  const to = countFrom(end);
  const direction = directions.find((each) => each === way);
  const scroll = countFrom(Reflect.get(value, 'scroll'));
  return {
    name,
    ...(Array.isArray(kept) &&
      kept.length === 3 &&
      from !== undefined &&
      to !== undefined &&
      direction !== undefined && { selection: [from, to, direction] }),
    ...(scroll !== undefined && scroll > 0 && { scroll }),
  };
}

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
    part.scrollLeft = kept.scroll;
  }
  return part.ownerDocument.activeElement === part;
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
