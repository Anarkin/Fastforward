export const shortcutsEntryAttribute = 'data-shortcuts';

export const shortcutsEntryOf = (element: Element | null): string | undefined =>
  element
    ?.closest(`[${shortcutsEntryAttribute}]`)
    ?.getAttribute(shortcutsEntryAttribute) ?? undefined;
