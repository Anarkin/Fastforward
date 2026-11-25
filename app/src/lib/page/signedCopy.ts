export const signedRegion = { 'data-signed': '' };

const region = '[data-signed]';

const sign = '[data-real]';

const elementNode = 1;

const textNode = 3;

const isElement = (node: Node): node is Element =>
  node.nodeType === elementNode;

const isText = (node: Node | null): node is Text => node?.nodeType === textNode;

function elementOf(node: Node): Element | null {
  return isElement(node) ? node : node.parentElement;
}

export function realText(selection: Selection): string {
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
  const drawn = texts.map((text) => (isText(text) ? text.data : ''));
  for (const [at, text] of texts.entries()) {
    if (isText(text)) {
      text.data = signs[at]?.dataset.real ?? text.data;
    }
  }
  const real = selection.toString();
  for (const [at, text] of texts.entries()) {
    if (isText(text)) {
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
