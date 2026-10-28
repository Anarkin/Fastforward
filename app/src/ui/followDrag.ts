import { released } from '../shell/shared/keymap';

export interface DragTarget<E> {
  addEventListener(type: string, listener: (event: E) => void): void;
  removeEventListener(type: string, listener: (event: E) => void): void;
}

const endEvents = ['pointerup', 'pointercancel', 'lostpointercapture'];

export function followDrag<E extends { readonly buttons: number }>(
  target: DragTarget<E>,
  onMove: (event: E) => void,
  onEnd: () => void,
): void {
  const move = (event: E) => {
    if (released(event)) {
      end();
    } else {
      onMove(event);
    }
  };
  const end = () => {
    target.removeEventListener('pointermove', move);
    for (const type of endEvents) {
      target.removeEventListener(type, end);
    }
    onEnd();
  };
  target.addEventListener('pointermove', move);
  for (const type of endEvents) {
    target.addEventListener(type, end);
  }
}
