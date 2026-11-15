export type Popup = 'shortcuts' | 'about' | 'openWith' | 'confirm';

export function withPopup(
  shown: readonly Popup[],
  popup: Popup,
  open: boolean,
): readonly Popup[] {
  if (shown.includes(popup) === open) {
    return shown;
  }
  return open ? [...shown, popup] : shown.filter((other) => other !== popup);
}
