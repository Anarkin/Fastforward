import * as assert from 'node:assert';
import { Virtualizer, type VirtualizerOptions } from '@tanstack/react-virtual';
import { realHeight, scrollCap } from '../../webview/cappedScroll';
import { CappedScroll, cappedScrolling } from '../../webview/cappedVirtualizer';

const rowHeight = 50;
const viewport = 500;

class Scroller {
  readonly clientHeight = viewport;
  scrollHeight = 0;
  readonly ownerDocument = {
    defaultView: {
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => {},
      setTimeout: () => 0,
      clearTimeout: () => {},
    },
  };
  private top = 0;
  private scrolledSince = false;
  private readonly listeners = new Set<() => void>();

  get scrollTop() {
    return this.top;
  }

  set scrollTop(value: number) {
    const top = Math.min(
      Math.max(0, value),
      this.scrollHeight - this.clientHeight,
    );
    if (top !== this.top) {
      this.top = top;
      this.scrolledSince = true;
    }
  }

  scrollTo({ top }: { top: number }) {
    this.scrollTop = top;
  }

  addEventListener(type: string, listener: () => void) {
    if (type === 'scroll') {
      this.listeners.add(listener);
    }
  }

  removeEventListener(_type: string, listener: () => void) {
    this.listeners.delete(listener);
  }

  dispatchEvent() {
    this.scrolledSince = true;
    return true;
  }

  frame() {
    while (this.scrolledSince) {
      this.scrolledSince = false;
      this.listeners.forEach((listener) => listener());
    }
  }
}

function list(count: number) {
  const scroller = new Scroller();
  const scroll = new CappedScroll();
  let redrawn = 0;
  scroll.redrawWith(() => {
    redrawn++;
    scroll.drawnAt(scroll.anchor.base);
  });
  const options: VirtualizerOptions<Element, Element> = {
    count,
    estimateSize: () => rowHeight,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    getScrollElement: () => scroller as unknown as Element,
    observeElementRect: (_instance, report) => {
      report({ width: 300, height: viewport });
    },
    overscan: 10,
    ...cappedScrolling<Element>(scroll),
  };
  const virtualizer = new Virtualizer<Element, Element>(options);
  // oxlint-disable-next-line no-underscore-dangle
  virtualizer._willUpdate();
  scroller.scrollHeight = realHeight(virtualizer.getTotalSize());
  const resize = (rows: number) => {
    virtualizer.setOptions({ ...options, count: rows });
    scroller.scrollHeight = realHeight(virtualizer.getTotalSize());
    scroller.scrollTop = Math.min(
      scroller.scrollTop,
      scroller.scrollHeight - viewport,
    );
  };
  const shown = () =>
    virtualizer
      .getVirtualItems()
      .filter(
        (row) =>
          row.start - scroll.anchor.base >= scroller.scrollTop &&
          row.end - scroll.anchor.base <= scroller.scrollTop + viewport,
      )
      .map((row) => row.index);
  return {
    scroller,
    scroll,
    virtualizer,
    shown,
    resize,
    redrawn: () => redrawn,
  };
}

suite('Capped virtualizer', () => {
  test('scrolls to any row of a list too long to lay out, drawing it in view', () => {
    const { scroller, virtualizer, shown } = list(1_300_000);
    assert.strictEqual(scroller.scrollHeight, scrollCap);
    virtualizer.scrollToIndex(1_000_000, { align: 'start' });
    scroller.frame();
    assert.strictEqual(virtualizer.scrollOffset, 1_000_000 * rowHeight);
    assert.deepStrictEqual(
      shown(),
      Array.from({ length: 10 }, (_, index) => 1_000_000 + index),
    );
  });

  test('scrolls to the last row of a list too long to lay out', () => {
    const { scroller, virtualizer, shown } = list(1_300_000);
    virtualizer.scrollToIndex(1_299_999, { align: 'end' });
    scroller.frame();
    assert.strictEqual(scroller.scrollTop, scrollCap - viewport);
    assert.strictEqual(shown().at(-1), 1_299_999);
  });

  test('scrolls a list too long to lay out by as much as the wheel does, and redraws its rows when they move', () => {
    const { scroller, virtualizer, shown, redrawn } = list(1_300_000);
    virtualizer.scrollToIndex(700_000, { align: 'start' });
    scroller.frame();
    assert.strictEqual(redrawn(), 1);
    scroller.scrollTop += 2 * rowHeight;
    scroller.frame();
    assert.strictEqual(virtualizer.scrollOffset, 700_002 * rowHeight);
    assert.strictEqual(shown()[0], 700_002);
    assert.strictEqual(redrawn(), 1);
  });

  test('keeps drawing the rows in view when a list too long to lay out gets shorter without scrolling, as a new history does', () => {
    for (const rows of [100_000, 200_000]) {
      const { scroller, scroll, virtualizer, shown, resize } = list(1_300_000);
      virtualizer.scrollToIndex(700_000, { align: 'start' });
      scroller.frame();
      resize(rows);
      assert.ok(scroll.fit());
      scroller.frame();
      const first = shown()[0];
      assert.strictEqual(
        first,
        Math.ceil((virtualizer.scrollOffset ?? 0) / rowHeight),
        String(rows),
      );
      scroller.scrollTop += 2 * rowHeight;
      scroller.frame();
      assert.strictEqual(shown()[0], first + 2, String(rows));
      assert.ok(!scroll.fit());
    }
  });

  test('scrolls a list short enough to lay out as it is', () => {
    const { scroller, virtualizer, scroll, redrawn } = list(1000);
    assert.strictEqual(scroller.scrollHeight, 1000 * rowHeight);
    virtualizer.scrollToIndex(600, { align: 'start' });
    scroller.frame();
    assert.strictEqual(scroller.scrollTop, 600 * rowHeight);
    assert.strictEqual(virtualizer.scrollOffset, 600 * rowHeight);
    assert.strictEqual(scroll.anchor.base, 0);
    assert.strictEqual(redrawn(), 0);
  });
});
