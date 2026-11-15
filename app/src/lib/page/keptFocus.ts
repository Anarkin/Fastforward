import { useEffect, useEffectEvent, type RefObject } from 'react';

export const focusNameAttribute = 'data-focus-name';

export interface KeptFocus {
  readonly name: string;
  readonly selection?: readonly [
    start: number,
    end: number,
    direction: 'forward' | 'backward' | 'none',
  ];
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
  return selection === undefined ? { name } : { name, selection };
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
