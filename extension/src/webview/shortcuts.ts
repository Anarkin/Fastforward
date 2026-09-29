import { useEffect, useEffectEvent } from 'react';

export interface Shortcut {
  readonly id: string;
  readonly key: string;
  readonly ctrl?: boolean;
  readonly description: string;
}

export const shortcuts = [
  { id: 'c', key: 'c', description: 'Show or hide the commit list' },
  {
    id: 'i',
    key: 'i',
    description: 'Peek at the whole message and details of the commit',
  },
  {
    id: 'ctrl+l',
    key: 'l',
    ctrl: true,
    description: 'Search branches, remotes and tags, or enter a hash',
  },
] as const satisfies readonly Shortcut[];

export type ShortcutId = (typeof shortcuts)[number]['id'];

const macOS =
  typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac');

export function shortcutOf(
  event: {
    readonly key: string;
    readonly ctrlKey: boolean;
    readonly shiftKey: boolean;
    readonly altKey: boolean;
    readonly metaKey: boolean;
    readonly repeat: boolean;
    readonly defaultPrevented: boolean;
    readonly target: EventTarget | null;
  },
  mac = macOS,
): (typeof shortcuts)[number] | undefined {
  if (
    event.shiftKey ||
    event.altKey ||
    (event.metaKey && !mac) ||
    event.repeat ||
    event.defaultPrevented
  ) {
    return undefined;
  }
  const ctrl = event.ctrlKey || event.metaKey;
  return shortcuts.find(
    (shortcut: Shortcut) =>
      shortcut.key === event.key.toLowerCase() &&
      (shortcut.ctrl ?? false) === ctrl &&
      (ctrl || !typing(event.target)),
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
