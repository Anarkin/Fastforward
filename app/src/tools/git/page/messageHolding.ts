import {
  hovered,
  modifierKey,
  pressed,
  type KeyPress,
  type Modifiers,
} from '../../../lib/shared/keymap';
import { gitKeymap } from './keymap';

export type Holding = 'none' | 'held' | 'spoiled';

export function holdingAfterKey(
  holding: Holding,
  press: KeyPress,
  down: boolean,
): Holding {
  if (hovered(gitKeymap.message, press) === undefined) {
    return 'none';
  }
  if (
    down &&
    !modifierKey(press) &&
    pressed(gitKeymap.peekStep, press, false) === undefined
  ) {
    return 'spoiled';
  }
  return holding === 'spoiled' ? 'spoiled' : 'held';
}

export function holdingAfterPointer(
  holding: Holding,
  pointer: Modifiers,
): Holding {
  if (hovered(gitKeymap.message, pointer) === undefined) {
    return 'none';
  }
  return holding === 'none' ? 'held' : holding;
}

interface Span {
  readonly top: number;
  readonly bottom: number;
}

export interface PeekAnchor {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly room: Span;
}

export function liftOf(box: Span, room: Span): number {
  return Math.max(0, Math.min(box.bottom - room.bottom, box.top - room.top));
}

export function hiddenLines(
  scrollHeight: number,
  clientHeight: number,
  lineHeight: number,
): number {
  return lineHeight > 0
    ? Math.max(0, Math.ceil((scrollHeight - clientHeight - 1) / lineHeight))
    : 0;
}

declare module 'react' {
  interface CSSProperties {
    readonly '--peek-row-width'?: string;
  }
}
