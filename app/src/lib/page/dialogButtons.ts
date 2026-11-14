import { keymap } from '../shared/keymap';
import { nextMenuItem } from './menuControls';
import { keyPressed } from './shortcuts';

export function moveBetweenButtons(
  event: Parameters<typeof keyPressed>[1] & {
    readonly currentTarget: Element;
    preventDefault(): void;
  },
): void {
  const move = keyPressed(keymap.dialogButton, event);
  if (move === undefined) {
    return;
  }
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      ':scope > button:not(:disabled)',
    ),
  );
  const next = nextMenuItem(
    move,
    buttons.findIndex(
      (button) => button === event.currentTarget.ownerDocument.activeElement,
    ),
    buttons.length,
  );
  if (next !== undefined) {
    event.preventDefault();
    buttons[next].focus();
  }
}
