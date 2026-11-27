import type { KeyboardEvent } from 'react';
import { bind, type Binding } from '../shared/keymap';
import { strings } from '../shared/strings';
import { keyPressed } from './shortcuts';

export const findBindings = {
  match: bind(
    'Searching',
    strings.actions.match,
    { Enter: 1, 'Shift+Enter': -1 } as const,
    { repeats: true, fields: true },
  ),
  stopFinding: bind(
    'Searching',
    strings.actions.stopFinding,
    { Escape: true },
    { fields: true },
  ),
};

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
