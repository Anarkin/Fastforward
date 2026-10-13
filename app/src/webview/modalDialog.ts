import { useEffect } from 'react';
import { keymap } from '../shared/keymap';
import { keyPressed } from './shortcuts';

const tabStops =
  'button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])';

function trapFocus(event: React.KeyboardEvent<HTMLElement>): void {
  const step = keyPressed(keymap.dialogFocus, event);
  if (step === undefined) {
    return;
  }
  const dialog = event.currentTarget;
  const stops = Array.from(dialog.querySelectorAll<HTMLElement>(tabStops));
  const current = stops.findIndex(
    (stop) => stop === dialog.ownerDocument.activeElement,
  );
  if (current === -1 || current === (step === 1 ? stops.length - 1 : 0)) {
    event.preventDefault();
    stops.at(step === 1 ? 0 : -1)?.focus();
  }
}

export function useModalDialog(dialog: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = dialog.current;
    const previous = element?.ownerDocument.activeElement;
    element?.focus();
    return () => {
      const active = element?.ownerDocument.activeElement;
      if (
        previous instanceof HTMLElement &&
        (!active ||
          active === element?.ownerDocument.body ||
          element?.contains(active))
      ) {
        previous.focus();
      }
    };
  }, [dialog]);
  return {
    role: 'dialog',
    'aria-modal': true,
    tabIndex: -1,
    onKeyDown: trapFocus,
  } as const;
}
