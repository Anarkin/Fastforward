import { useEffect, useEffectEvent } from 'react';

// The keys the view answers to, as the shortcuts panel lists them
export interface Shortcut {
  readonly id: string;
  // KeyboardEvent.key, so a lowercase letter is without Shift
  readonly key: string;
  // With Ctrl held; these work while typing in a field too, as Chrome's do
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

// The shortcut a key press is, if any: once per press, not repeating, with
// no other modifiers than its own, which leaves the rest to VS Code, and a
// key without Ctrl not while typing in a field
export function shortcutOf(event: {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly repeat: boolean;
  readonly defaultPrevented: boolean;
  readonly target: EventTarget | null;
}): (typeof shortcuts)[number] | undefined {
  if (event.altKey || event.metaKey || event.repeat || event.defaultPrevented) {
    return undefined;
  }
  return shortcuts.find(
    (shortcut: Shortcut) =>
      shortcut.key === event.key &&
      (shortcut.ctrl ?? false) === event.ctrlKey &&
      (event.ctrlKey || !typing(event.target)),
  );
}

// By its tag rather than its class, which there is none of outside a page
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

// Runs the action of each of these shortcuts pressed; the parts of the view
// take the shortcuts that are about them
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
