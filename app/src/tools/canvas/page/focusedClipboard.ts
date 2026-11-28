const kinds = ['copy', 'cut', 'paste'] as const;

export function watchClipboard(
  element: HTMLElement,
  heard: (event: ClipboardEvent) => void,
): () => void {
  const page = element.ownerDocument;
  const whileFocused = (event: ClipboardEvent) => {
    if (page.activeElement === element) {
      heard(event);
    }
  };
  for (const kind of kinds) {
    page.addEventListener(kind, whileFocused);
  }
  return () => {
    for (const kind of kinds) {
      page.removeEventListener(kind, whileFocused);
    }
  };
}
