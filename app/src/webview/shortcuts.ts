import { useEffect, useEffectEvent } from 'react';

const shortcutKeys = ['c', 's'] as const;

export type ShortcutKey = (typeof shortcutKeys)[number];

type ShortcutEvent = Pick<
  KeyboardEvent,
  | 'key'
  | 'code'
  | 'ctrlKey'
  | 'shiftKey'
  | 'altKey'
  | 'metaKey'
  | 'repeat'
  | 'defaultPrevented'
  | 'target'
>;

export function shortcutOf(event: ShortcutEvent): ShortcutKey | undefined {
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey ||
    event.repeat ||
    event.defaultPrevented ||
    typing(event.target)
  ) {
    return undefined;
  }
  const key =
    /^[a-z]$/i.test(event.key) || !/^Key[A-Z]$/.test(event.code)
      ? event.key.toLowerCase()
      : event.code.slice(3).toLowerCase();
  return shortcutKeys.find((shortcut) => shortcut === key);
}

export function isFindShortcut(
  event: Pick<
    KeyboardEvent,
    'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'
  >,
): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.shiftKey &&
    !event.altKey &&
    (event.key.toLowerCase() === 'f' || event.code === 'KeyF')
  );
}

export function isNewTabShortcut(
  event: Pick<
    KeyboardEvent,
    'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'
  >,
): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.shiftKey &&
    !event.altKey &&
    (event.key.toLowerCase() === 't' || event.code === 'KeyT')
  );
}

export function tabStep(
  event: Pick<
    KeyboardEvent,
    'key' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'
  >,
): 1 | -1 | undefined {
  if (event.key !== 'Tab' || !event.ctrlKey || event.altKey || event.metaKey) {
    return undefined;
  }
  return event.shiftKey ? -1 : 1;
}

export function handleShortcut(
  event: ShortcutEvent & Pick<KeyboardEvent, 'preventDefault'>,
  actions: Readonly<Partial<Record<ShortcutKey, () => void>>>,
): void {
  const shortcut = shortcutOf(event);
  const action = shortcut && actions[shortcut];
  if (action) {
    event.preventDefault();
    action();
  }
}

const fields = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isElement(target: EventTarget | null): target is HTMLElement {
  return target !== null && 'tagName' in target;
}

function typing(target: EventTarget | null): boolean {
  return (
    isElement(target) &&
    (target.isContentEditable || fields.has(target.tagName))
  );
}

export function useShortcuts(
  actions: Readonly<Partial<Record<ShortcutKey, () => void>>>,
): void {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) =>
    handleShortcut(event, actions),
  );
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
