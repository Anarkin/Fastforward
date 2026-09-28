import { useEffect, useEffectEvent } from 'react';

// The keys the view answers to, as the shortcuts panel lists them
export interface Shortcut {
  // KeyboardEvent.key, so a lowercase letter is without Shift
  readonly key: string;
  readonly description: string;
}

export const shortcuts = [
  { key: 'c', description: 'Show or hide the commit list' },
] as const satisfies readonly Shortcut[];

export type ShortcutKey = (typeof shortcuts)[number]['key'];

// The shortcut a key press is, if any: not while typing in a field, not with
// Ctrl, Alt or Cmd, which are VS Code's, and once per press, not repeating
export function shortcutOf(event: {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly repeat: boolean;
  readonly defaultPrevented: boolean;
  readonly target: EventTarget | null;
}): (typeof shortcuts)[number] | undefined {
  if (
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.repeat ||
    event.defaultPrevented ||
    typing(event.target)
  ) {
    return undefined;
  }
  return shortcuts.find((shortcut) => shortcut.key === event.key);
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

// Runs the action of each shortcut pressed
export function useShortcuts(
  actions: Readonly<Record<ShortcutKey, () => void>>,
): void {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const shortcut = shortcutOf(event);
    if (shortcut) {
      event.preventDefault();
      actions[shortcut.key]();
    }
  });
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
