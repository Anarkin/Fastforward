import './style.css';
import { columnFocusAttribute } from '../../../lib/page/columnFocus';

export function sideToFocus(
  column: Element | undefined,
  focused: Element | null,
): HTMLElement | undefined {
  return column === undefined || column.contains(focused)
    ? undefined
    : (column.querySelector<HTMLElement>(`[${columnFocusAttribute}]`) ??
        undefined);
}
