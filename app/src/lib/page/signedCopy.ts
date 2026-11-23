export const signedRegion = { 'data-signed': '' };

const region = '[data-signed]';

const sign = '[data-real]';

function elementOf(node: Node): Element | null {
  return node instanceof Element ? node : node.parentElement;
}

function realText(selection: Selection): string {
  const shown = selection.toString();
  if (selection.rangeCount === 0) {
    return shown;
  }
  const range = selection.getRangeAt(0);
  const within = elementOf(range.commonAncestorContainer)?.closest(region);
  if (within === null || within === undefined) {
    return shown;
  }
  const signs = [...within.querySelectorAll<HTMLElement>(sign)].filter((each) =>
    range.intersectsNode(each),
  );
  if (signs.length === 0) {
    return shown;
  }
  const texts = signs.map((each) => each.firstChild);
  const drawn = texts.map((text) => (text instanceof Text ? text.data : ''));
  for (const [at, text] of texts.entries()) {
    if (text instanceof Text) {
      text.data = signs[at]?.dataset.real ?? text.data;
    }
  }
  const real = selection.toString();
  for (const [at, text] of texts.entries()) {
    if (text instanceof Text) {
      text.data = drawn[at] ?? text.data;
    }
  }
  return real;
}

export function copyReal(event: ClipboardEvent): void {
  const selection = document.getSelection();
  const focused = document.activeElement;
  if (
    event.defaultPrevented ||
    event.clipboardData === null ||
    selection === null ||
    selection.isCollapsed ||
    focused instanceof HTMLInputElement ||
    focused instanceof HTMLTextAreaElement
  ) {
    return;
  }
  const real = realText(selection);
  if (real !== selection.toString()) {
    event.clipboardData.setData('text/plain', real);
    event.preventDefault();
  }
}
