import { keymap } from '../../../lib/page/keymap';
import { keyPressed } from '../../../lib/page/shortcuts';

export const contextMenus = '.context-menu';

export function focusLeaves<
  Focused extends { closest(selector: string): unknown },
>(
  popup: { readonly contains: (focused: Focused) => boolean } | null,
  focused: Focused | null,
): boolean {
  return (
    focused !== null &&
    popup !== null &&
    !popup.contains(focused) &&
    focused.closest(contextMenus) === null
  );
}

export function popupKeyAction(
  event: Parameters<typeof keyPressed>[1],
): 1 | -1 | 'enter' | undefined {
  return (
    keyPressed(keymap.result, event) ??
    (keyPressed(keymap.go, event) ? 'enter' : undefined)
  );
}
