import type { KeyboardEvent } from 'react';
import type { Binding } from '../shared/keymap';
import { keyPressed } from './shortcuts';

export interface FindKeys {
  readonly match: Binding<1 | -1>;
  readonly stopFinding: Binding<boolean>;
}

export function findKeyDown(
  keys: FindKeys,
  onStep: (step: 1 | -1) => void,
  onClose: () => void,
): (event: KeyboardEvent<HTMLInputElement>) => void {
  return (event) => {
    const step = keyPressed(keys.match, event);
    if (step !== undefined) {
      event.preventDefault();
      onStep(step);
    } else if (keyPressed(keys.stopFinding, event)) {
      event.preventDefault();
      onClose();
    }
  };
}
