import { JSDOM } from 'jsdom';

const document = new JSDOM(
  '',
).window.document.implementation.createHTMLDocument();

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
  return element;
}
