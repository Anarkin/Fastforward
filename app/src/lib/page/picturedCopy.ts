import { hasPictures, unpictured } from './controlPictures';

export const picturedRegion = { 'data-pictured': '' };

const region = '[data-pictured]';
const genuine = '[data-genuine]';

export function realOf(shown: string, withoutGenuine: string): string {
  if (shown === withoutGenuine) {
    return unpictured(shown);
  }
  let real = '';
  let run = 0;
  let other = 0;
  for (let at = 0; at < shown.length; at++) {
    if (shown[at] === withoutGenuine[other]) {
      other++;
    } else {
      real += unpictured(shown.slice(run, at)) + shown[at];
      run = at + 1;
    }
  }
  return real + unpictured(shown.slice(run));
}

const marker = '﷐';

export function realWhere(shown: string, marked: string): string {
  let real = '';
  let run = 0;
  for (let at = 0; at < shown.length; at++) {
    if (marked[at] === marker) {
      real += unpictured(shown.slice(run, at)) + shown[at];
      run = at + 1;
    }
  }
  return real + unpictured(shown.slice(run));
}

function textsOf(elements: readonly Element[]): Text[] {
  const texts: Text[] = [];
  for (const element of elements) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (
      let node = walker.nextNode();
      node !== null;
      node = walker.nextNode()
    ) {
      if (node instanceof Text) {
        texts.push(node);
      }
    }
  }
  return texts;
}

function markedText(
  selection: Selection,
  range: Range,
  kept: readonly Element[],
): string | undefined {
  const texts = textsOf(kept);
  if (
    texts.some(
      (text) => text === range.startContainer || text === range.endContainer,
    )
  ) {
    return undefined;
  }
  const written = texts.map((text) => text.data);
  for (const text of texts) {
    text.data = marker.repeat(text.data.length);
  }
  const marked = selection.toString();
  for (const [at, text] of texts.entries()) {
    text.data = written[at] ?? '';
  }
  return marked;
}

function elementOf(node: Node): Element | null {
  return node instanceof Element ? node : node.parentElement;
}

function realIn(selection: Selection, range: Range, within: Element): string {
  const shown = selection.toString();
  if (!hasPictures(shown)) {
    return shown;
  }
  const kept = [...within.querySelectorAll<HTMLElement>(genuine)].filter(
    (each) => range.intersectsNode(each),
  );
  if (kept.length === 0) {
    return unpictured(shown);
  }
  const marked = shown.includes(marker)
    ? undefined
    : markedText(selection, range, kept);
  if (marked?.length === shown.length) {
    return realWhere(shown, marked);
  }
  const selectable = kept.map((each) => each.style.userSelect);
  for (const each of kept) {
    each.style.userSelect = 'none';
  }
  const withoutGenuine = selection.toString();
  for (const [at, each] of kept.entries()) {
    each.style.userSelect = selectable[at];
  }
  return realOf(shown, withoutGenuine);
}

function realText(selection: Selection): string {
  if (selection.rangeCount === 0) {
    return selection.toString();
  }
  const range = selection.getRangeAt(0);
  const within = elementOf(range.commonAncestorContainer)?.closest(region);
  if (within === null || within === undefined) {
    return selection.toString();
  }
  return realIn(selection, range, within);
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
