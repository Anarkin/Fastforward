import { useEffect, useEffectEvent } from 'react';

export interface Shortcut {
  readonly id: string;
  readonly key: string;
  readonly description: string;
}

export const shortcuts = [
  { id: 'c', key: 'c', description: 'Show or hide the commit list' },
  {
    id: 's',
    key: 's',
    description: 'Search branches, remotes and tags, or enter a hash',
  },
] as const satisfies readonly Shortcut[];

export type ShortcutId = (typeof shortcuts)[number]['id'];

export function shortcutOf(event: {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly repeat: boolean;
  readonly defaultPrevented: boolean;
  readonly target: EventTarget | null;
}): (typeof shortcuts)[number] | undefined {
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
  return shortcuts.find(
    (shortcut: Shortcut) => shortcut.key === event.key.toLowerCase(),
  );
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
  actions: Readonly<Partial<Record<ShortcutId, () => void>>>,
): void {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const shortcut = shortcutOf(event);
    const action = shortcut && actions[shortcut.id];
    if (action) {
      event.preventDefault();
      action();
    }
  });
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
