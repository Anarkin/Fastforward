import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test, vi } from 'vitest';
import {
  blockAtTop,
  holdBlockAtTop,
  settleWait,
} from '../../../../../tools/viewer/page/previewPlace';

const blockHeight = 20;

function preview(blocks: number) {
  const { document } = new JSDOM('<!doctype html><div></div>').window;
  const scroller = document.createElement('div');
  const markdown = document.createElement('div');
  markdown.className = 'markdown';
  scroller.append(markdown);
  const place = { scrolled: 0, grown: 0, reads: 0 };
  Object.defineProperty(scroller, 'scrollTop', {
    get: () => place.scrolled,
    set: (top: number) => {
      place.scrolled = top;
    },
  });
  scroller.getBoundingClientRect = () => rectOf(100, 400);
  for (let index = 0; index < blocks; index++) {
    const block = document.createElement('p');
    block.getBoundingClientRect = () => {
      place.reads++;
      const top =
        100 -
        place.scrolled +
        index * blockHeight +
        (index > 0 ? place.grown : 0);
      return rectOf(top, top + blockHeight);
    };
    markdown.append(block);
  }
  return { scroller, place };
}

function rectOf(top: number, bottom: number): DOMRect {
  return {
    top,
    bottom,
    left: 0,
    right: 100,
    width: 100,
    height: bottom - top,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}

suite('The place of a Markdown preview', () => {
  test('finds the block at the top of a long preview reading a few blocks rather than every one, as it runs as the preview scrolls', () => {
    const { scroller, place } = preview(10_000);
    place.scrolled = 5000 + 7;
    place.reads = 0;

    assert.deepStrictEqual(blockAtTop(scroller), { block: 250, offset: 7 });
    assert.ok(place.reads < 40, `${place.reads} blocks read`);
  });

  test('keeps the block it comes back to at the top while what is above it grows, as images and diagrams lay out, until the preview settles or is scrolled by hand', () => {
    vi.useFakeTimers();
    try {
      const { scroller, place } = preview(100);
      let changed: (() => void) | undefined;
      let done = 0;
      holdBlockAtTop(
        scroller,
        { block: 10, offset: 5 },
        () => done++,
        (_element, onChange) => {
          changed = onChange;
          return () => {
            changed = undefined;
          };
        },
      );
      assert.strictEqual(place.scrolled, 10 * blockHeight + 5);

      place.grown = 300;
      changed?.();
      assert.strictEqual(place.scrolled, 10 * blockHeight + 300 + 5);
      vi.advanceTimersByTime(settleWait);
      assert.strictEqual(done, 1);
      place.grown = 600;
      changed?.();
      assert.strictEqual(place.scrolled, 10 * blockHeight + 300 + 5);

      const again = preview(100);
      let doneAgain = 0;
      holdBlockAtTop(
        again.scroller,
        { block: 10, offset: 5 },
        () => doneAgain++,
        () => () => {},
      );
      const window = again.scroller.ownerDocument.defaultView;
      assert.ok(window);
      again.scroller.dispatchEvent(new window.Event('wheel'));
      assert.strictEqual(doneAgain, 1);
    } finally {
      vi.useRealTimers();
    }
  });
});
