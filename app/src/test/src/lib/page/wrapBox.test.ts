import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { afterEach, suite, test, vi } from 'vitest';
import { boxColumns } from '../../../../lib/page/wrapBox';

function box(width: number, padding: string): Element {
  const dom = new JSDOM(
    `<!doctype html><body><div style="padding: ${padding}"></div></body>`,
  );
  vi.stubGlobal(
    'getComputedStyle',
    dom.window.getComputedStyle.bind(dom.window),
  );
  const element = dom.window.document.querySelector('div');
  assert.ok(element);
  element.getBoundingClientRect = () => new dom.window.DOMRect(0, 0, width, 0);
  return element;
}

suite('Wrap box', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('wraps at as many whole characters as the box holds inside its padding, the room kept for the marks of the breaks and what covers its right edge left out', () => {
    assert.strictEqual(boxColumns(box(1323.6, '0 42.4px 0 0'), 7.2), 177);
    assert.strictEqual(boxColumns(box(1323.6, '0'), 7.2), 183);
    assert.strictEqual(boxColumns(box(1385.6, '0 42.4px 0 62px'), 7.2), 177);
  });

  test('counts the width the box is laid out at, a fraction of a pixel too, rather than whole pixels, and a box as wide as some characters as that many, whatever the rounding of their widths', () => {
    assert.strictEqual(boxColumns(box(100.9, '0'), 10.09), 10);
    assert.strictEqual(
      boxColumns(box(177 * 7.2 + 42.4, '0 42.4px 0 0'), 7.2),
      177,
    );
  });
});
