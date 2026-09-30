import { useEffect, useEffectEvent } from 'react';

export interface Shortcut {
  readonly key: string;
  readonly description: string;
}

export const shortcuts = [
  { key: 'c', description: 'Show or hide the commit list' },
  {
    key: 's',
    description: 'Search branches, remotes and tags, or enter a hash',
  },
] as const satisfies readonly Shortcut[];

export type ShortcutKey = (typeof shortcuts)[number]['key'];

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

export function shortcutOf(
  event: ShortcutEvent,
): (typeof shortcuts)[number] | undefined {
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
  return shortcuts.find((shortcut) => shortcut.key === key);
}

export function handleShortcut(
  event: ShortcutEvent & Pick<KeyboardEvent, 'preventDefault'>,
  actions: Readonly<Partial<Record<ShortcutKey, () => void>>>,
): void {
  const shortcut = shortcutOf(event);
  const action = shortcut && actions[shortcut.key];
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
