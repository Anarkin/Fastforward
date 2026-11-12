import { JSDOM } from 'jsdom';

const { window } = new JSDOM('');
const document = window.document.implementation.createHTMLDocument();

export function laidOutElement(
  sizes: { clientHeight?: number; offsetHeight?: number; scrollTop?: number },
  index?: number,
): HTMLElement {
  const element = document.createElement('div');
  if (index !== undefined) {
    element.setAttribute('data-index', String(index));
  }
  for (const [name, value] of Object.entries(sizes)) {
    Object.defineProperty(element, name, { value, writable: true });
  }
  document.body.append(element);
  return element;
}

export function laidOutRow(height: number, index?: number): HTMLElement {
  const row = laidOutElement({ offsetHeight: Math.round(height) }, index);
  row.getBoundingClientRect = () => new window.DOMRect(0, 0, 0, height);
  return row;
}
