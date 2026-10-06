import { useEffect, useEffectEvent } from 'react';
import { pressed, type Binding, type KeyPress } from '../shared/keymap';

type KeyEvent = KeyPress & { readonly target: EventTarget | null };

export function keyPressed<Value>(
  binding: Binding<Value>,
  event: KeyEvent,
): Value | undefined {
  return pressed(binding, event, typing(event.target));
}

export function isKeyPress(event: Event): event is Event & KeyEvent {
  return 'key' in event;
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

function useWindowKeyDown(handler: (event: KeyboardEvent) => void): void {
  const onKeyDown = useEffectEvent(handler);
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

export function useBinding<Value>(
  binding: Binding<Value>,
  action: (value: Value) => void,
): void {
  useWindowKeyDown((event) => {
    const value = keyPressed(binding, event);
    if (value !== undefined) {
      event.preventDefault();
      action(value);
    }
  });
}
