export const columnFocusAttribute = 'data-column-focus';

export function columnFocusOf(
  element: { closest(selector: string): ParentNode | null } | null,
): HTMLElement | null | undefined {
  return element
    ?.closest('.column')
    ?.querySelector<HTMLElement>(`[${columnFocusAttribute}]`);
}
