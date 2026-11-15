import { clicked, type Modifiers } from '../../../lib/shared/keymap';
import { keymap } from '../../../lib/page/keymap';

export function pointerFraction(
  clientY: number,
  box: { readonly top: number; readonly height: number },
): number {
  return box.height > 0 ? (clientY - box.top) / box.height : 0;
}

export function minimapScrollTop(
  fraction: number,
  total: number,
  viewport: number,
): number {
  const top = fraction * total - viewport / 2;
  return Math.max(0, Math.min(top, total - viewport));
}

export function grabPointer(
  event: Modifiers & {
    readonly button: number;
    readonly pointerId: number;
    readonly preventDefault: () => void;
    readonly currentTarget: { setPointerCapture: (id: number) => void };
  },
): boolean {
  if (!clicked(keymap.drag, event)) {
    return false;
  }
  event.preventDefault();
  event.currentTarget.setPointerCapture(event.pointerId);
  return true;
}
