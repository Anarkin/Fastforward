import { useEffect, useEffectEvent } from 'react';

const shortcutKeys = ['c', 's', 'w'] as const;

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
  const key = letterOf(event);
  return shortcutKeys.find((shortcut) => shortcut === key);
}

function letterOf(event: Pick<KeyboardEvent, 'key' | 'code'>): string {
  return /^[a-z]$/i.test(event.key) || !/^Key[A-Z]$/.test(event.code)
    ? event.key.toLowerCase()
    : event.code.slice(3).toLowerCase();
}

type CommandEvent = Pick<
  KeyboardEvent,
  'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'
>;

function isCommandShortcut(event: CommandEvent, letter: string): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.shiftKey &&
    !event.altKey &&
    letterOf(event) === letter
  );
}

export function isFindShortcut(event: CommandEvent): boolean {
  return isCommandShortcut(event, 'f');
}

export function isNewTabShortcut(event: CommandEvent): boolean {
  return isCommandShortcut(event, 't');
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

export function changeStep(
  event: Pick<KeyboardEvent, 'key' | 'code'>,
): 1 | -1 | undefined {
  const letter = letterOf(event);
  return letter === 'j' ? 1 : letter === 'k' ? -1 : undefined;
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

export function typing(target: EventTarget | null): boolean {
  return (
    isElement(target) &&
    (target.isContentEditable || fields.has(target.tagName))
  );
}

export function useWindowKeyDown(
  handler: (event: KeyboardEvent) => void,
): void {
  const onKeyDown = useEffectEvent(handler);
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

export function useShortcuts(
  actions: Readonly<Partial<Record<ShortcutKey, () => void>>>,
): void {
  useWindowKeyDown((event) => handleShortcut(event, actions));
}
