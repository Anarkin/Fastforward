import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test } from 'vitest';
import { scrolledTo, watchScrollEnds } from '../../../../shell/page/scrollEnds';

function page() {
  const dom = new JSDOM('<!doctype html><body><div id="list"></div>');
  const { document } = dom.window;
  watchScrollEnds(document);
  const list = document.getElementById('list');
  assert.ok(list);
  const sizes = {
    scrollTop: 0,
    scrollHeight: 1000,
    clientHeight: 200,
    scrollLeft: 0,
    scrollWidth: 500,
    clientWidth: 300,
  };
  for (const name of [
    'scrollTop',
    'scrollHeight',
    'clientHeight',
    'scrollLeft',
    'scrollWidth',
    'clientWidth',
  ] as const) {
    Object.defineProperty(list, name, { get: () => sizes[name] });
  }
  let written = 0;
  new dom.window.MutationObserver((records) => {
    written += records.length;
  }).observe(list, { attributes: true });
  return {
    sizes,
    written: async () => {
      await Promise.resolve();
      return written;
    },
    scrolled: () => {
      list.dispatchEvent(new dom.window.Event('scroll'));
      return [
        list.getAttribute('data-scrolled-vertical'),
        list.getAttribute('data-scrolled-horizontal'),
      ];
    },
  };
}

suite('Scroll ends', () => {
  test('tells where something is scrolled to along one way: nothing at its start, its end from a pixel before it, as the browser rounds what it reports, and the middle between them', () => {
    assert.deepStrictEqual(
      [
        scrolledTo(0, 800),
        scrolledTo(1, 800),
        scrolledTo(798.9, 800),
        scrolledTo(799, 800),
        scrolledTo(800, 800),
        scrolledTo(0, 0),
      ],
      [undefined, 'middle', 'middle', 'end', 'end', undefined],
    );
  });

  test('marks what scrolls on the page by where it is scrolled to, down and across apart, once it scrolls and wherever in the page it is, so a button of its scrollbar that can scroll no further is drawn as one that cannot, and writes nothing while it stays where it was', async () => {
    const { sizes, scrolled, written } = page();
    assert.deepStrictEqual(scrolled(), [null, null]);
    sizes.scrollTop = 300;
    assert.deepStrictEqual(scrolled(), ['middle', null]);
    sizes.scrollTop = 310;
    assert.deepStrictEqual(scrolled(), ['middle', null]);
    assert.strictEqual(await written(), 1);
    sizes.scrollTop = 799.5;
    sizes.scrollLeft = 40;
    assert.deepStrictEqual(scrolled(), ['end', 'middle']);
    sizes.scrollLeft = 200;
    assert.deepStrictEqual(scrolled(), ['end', 'end']);
    sizes.scrollTop = 0;
    sizes.scrollLeft = 0;
    assert.deepStrictEqual(scrolled(), [null, null]);
    assert.strictEqual(await written(), 6);
  });
});
