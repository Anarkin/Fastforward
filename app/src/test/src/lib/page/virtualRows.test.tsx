import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { estimatedRowHeight } from '../../../../lib/page/listRows';
import { VirtualRows } from '../../../../lib/page/virtualRows';
import { noop } from '../../../helpers/fixtures';
import { defaultScrolling } from '../../../../lib/page/scrollSettings';
import { rowScrollerOf } from '../../../../lib/page/scrollbarLinks';

async function inWholeRows(
  run: (shown: {
    readonly main: Element;
    readonly scroller: Element;
    readonly window: JSDOM['window'];
  }) => void,
): Promise<void> {
  const dom = new JSDOM('<!doctype html><main></main>', {
    pretendToBeVisual: true,
  });
  for (const [side, size] of [
    ['offsetWidth', 400],
    ['offsetHeight', 240],
    ['clientWidth', 400],
    ['clientHeight', 240],
  ] as const) {
    Object.defineProperty(dom.window.HTMLElement.prototype, side, {
      get: () => size,
    });
  }
  dom.window.HTMLElement.prototype.getBoundingClientRect = function (
    this: HTMLElement,
  ) {
    const height = this.classList.contains('virtual-row')
      ? estimatedRowHeight
      : 240;
    return new dom.window.DOMRect(0, 0, 400, height);
  };
  const globals = {
    window: dom.window,
    document: dom.window.document,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    ResizeObserver: class {
      observe = noop;
      unobserve = noop;
      disconnect = noop;
    },
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const saved = Object.fromEntries(
    Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
  );
  Object.assign(globalThis, globals);
  try {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const main = dom.window.document.querySelector('main');
    assert.ok(main);
    const root = createRoot(main);
    const keys = Array.from({ length: 1000 }, (_, index) => `row:${index}`);
    await act(async () =>
      root.render(
        <VirtualRows
          scrolling={{ ...defaultScrolling, smooth: false }}
          rows={{
            count: keys.length,
            keyOf: (index: number) => keys[index],
            indexOf: (key: string) => keys.indexOf(key),
          }}
          renderRow={(index) => keys[index]}
          selectedKey={undefined}
          initialRect={{ width: 400, height: 240 }}
          wholeRows
        />,
      ),
    );
    const scroller = main.querySelector('.virtual-rows');
    assert.ok(scroller);
    run({ main, scroller, window: dom.window });
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, saved);
  }
}

suite('Virtual rows', () => {
  test('draws only the rows in view of a long list, not every row', () => {
    const drawn: number[] = [];
    const keys = Array.from({ length: 10_000 }, (_, index) => `row:${index}`);
    renderToStaticMarkup(
      <VirtualRows
        scrolling={defaultScrolling}
        rows={{
          count: keys.length,
          keyOf: (index) => keys[index],
          indexOf: (key) => keys.indexOf(key),
        }}
        renderRow={(index) => {
          drawn.push(index);
          return keys[index];
        }}
        selectedKey={undefined}
        initialRect={{ width: 400, height: 240 }}
      />,
    );
    const inView = Array.from({ length: 10 }, (_, index) => index);
    assert.deepStrictEqual(drawn.slice(0, inView.length), inView);
    assert.ok(drawn.length < 100, `${drawn.length} rows drawn`);
  });

  test('draws a row again only once the function that draws it changes, not each time the list is drawn again as it scrolls, as drawing every row each frame took most of the frame', async () => {
    const dom = new JSDOM('<!doctype html><main></main>', {
      pretendToBeVisual: true,
    });
    for (const [side, size] of [
      ['offsetWidth', 400],
      ['offsetHeight', 240],
      ['clientWidth', 400],
      ['clientHeight', 240],
    ] as const) {
      Object.defineProperty(dom.window.HTMLElement.prototype, side, {
        get: () => size,
      });
    }
    const globals = {
      window: dom.window,
      document: dom.window.document,
      Element: dom.window.Element,
      HTMLElement: dom.window.HTMLElement,
      requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
      cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    const saved = Object.fromEntries(
      Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
    );
    Object.assign(globalThis, globals);
    try {
      const { act } = await import('react');
      const { createRoot } = await import('react-dom/client');
      const main = dom.window.document.querySelector('main');
      assert.ok(main);
      const root = createRoot(main);
      let drawn = 0;
      const keys = Array.from({ length: 1000 }, (_, index) => `row:${index}`);
      const listed = {
        count: keys.length,
        keyOf: (index: number) => keys[index],
        indexOf: (key: string) => keys.indexOf(key),
      };
      const drawRow = (index: number) => {
        drawn++;
        return keys[index];
      };
      const list = (renderRow: (index: number) => React.ReactNode) => (
        <VirtualRows
          scrolling={defaultScrolling}
          rows={listed}
          renderRow={renderRow}
          selectedKey={undefined}
          initialRect={{ width: 400, height: 240 }}
        />
      );
      await act(async () => root.render(list(drawRow)));
      const shown = main.querySelectorAll('.virtual-row').length;
      assert.ok(shown > 0);

      drawn = 0;
      await act(async () => root.render(list(drawRow)));
      assert.strictEqual(drawn, 0);

      await act(async () => root.render(list((index) => drawRow(index))));
      assert.strictEqual(drawn, main.querySelectorAll('.virtual-row').length);
      await act(async () => root.unmount());
    } finally {
      Object.assign(globalThis, saved);
    }
  });

  test('goes to the place kept for what it lists once that changes, the top for one with none kept, staying mounted, so a list of the files of each commit is not drawn anew from nothing as the commits are stepped through', async () => {
    const dom = new JSDOM('<!doctype html><main></main>', {
      pretendToBeVisual: true,
    });
    const globals = {
      window: dom.window,
      document: dom.window.document,
      Element: dom.window.Element,
      HTMLElement: dom.window.HTMLElement,
      requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
      cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    const saved = Object.fromEntries(
      Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
    );
    Object.assign(globalThis, globals);
    try {
      const { act } = await import('react');
      const { createRoot } = await import('react-dom/client');
      const main = dom.window.document.querySelector('main');
      assert.ok(main);
      const root = createRoot(main);
      const keys = Array.from({ length: 1000 }, (_, index) => `row:${index}`);
      const list = (place: string, kept: number | undefined) => (
        <VirtualRows
          scrolling={defaultScrolling}
          rows={{
            count: keys.length,
            keyOf: (index: number) => keys[index],
            indexOf: (key: string) => keys.indexOf(key),
          }}
          renderRow={(index) => keys[index]}
          selectedKey={undefined}
          initialRect={{ width: 400, height: 240 }}
          placeKey={place}
          initialOffset={kept}
          revealAtStart={kept === undefined}
        />
      );
      await act(async () => root.render(list('one', undefined)));
      const scroller = main.querySelector('.virtual-rows');
      assert.ok(scroller);
      scroller.scrollTop = 300;
      await act(async () => root.render(list('two', 120)));
      const placed = [scroller.scrollTop];
      await act(async () => root.render(list('three', undefined)));
      placed.push(scroller.scrollTop);
      assert.ok(
        main.querySelector('.virtual-rows') === scroller,
        'the list kept',
      );
      assert.deepStrictEqual(placed, [120, 0]);
      await act(async () => root.unmount());
    } finally {
      Object.assign(globalThis, saved);
    }
  });

  test('draws the rows of the place a list of whole rows is moved to as it is moved, by its wheel, its keys or its scrollbar, not a frame later once the browser tells of the scroll, as a page down showed half a list for a frame', async () => {
    const { act } = await import('react');
    await inWholeRows(({ main, scroller }) => {
      const moveTo = rowScrollerOf(scroller);
      assert.ok(moveTo);
      const row = 500;
      act(() => moveTo(row * estimatedRowHeight));

      assert.strictEqual(scroller.scrollTop, row * estimatedRowHeight);
      assert.ok(
        main.querySelector(`.virtual-row[data-index="${row}"]`),
        [...main.querySelectorAll('.virtual-row')]
          .map((shown) => shown.getAttribute('data-index'))
          .join(' '),
      );
    });
  });

  test('scrolls a list of whole rows down by the wheel turned alone and leaves the wheel turned with Shift held to scroll sideways, as it scrolled a diff down and across at once', async () => {
    const { act } = await import('react');
    await inWholeRows(({ scroller, window }) => {
      const turn = (shiftKey: boolean) =>
        act(() => {
          scroller.dispatchEvent(
            new window.WheelEvent('wheel', {
              deltaY: 3 * estimatedRowHeight,
              shiftKey,
              bubbles: true,
              cancelable: true,
            }),
          );
        });
      turn(true);
      const held = scroller.scrollTop;
      turn(false);

      assert.deepStrictEqual(
        [held, scroller.scrollTop],
        [0, 3 * estimatedRowHeight],
      );
    });
  });

  test('sizes the rows not drawn yet at the fixed height of a row, so the list is as long as it will be', () => {
    const html = renderToStaticMarkup(
      <VirtualRows
        scrolling={defaultScrolling}
        rows={{
          count: 1000,
          keyOf: (index) => `row:${index}`,
          indexOf: () => -1,
        }}
        renderRow={() => null}
        selectedKey={undefined}
      />,
    );
    const height = 1000 * estimatedRowHeight;
    assert.match(
      html,
      new RegExp(`class="virtual-spacer" style="height:${height}px"`),
    );
  });
});

suite('Virtual rows for assistive technology', () => {
  const keys = ['folder:a', 'file:a/b', 'file:c'];
  const listed = {
    count: keys.length,
    keyOf: (index: number) => keys[index],
    indexOf: (key: string) => keys.indexOf(key),
  };
  const drawn = (selectedKey: string, tree: boolean) =>
    new JSDOM(
      renderToStaticMarkup(
        <VirtualRows
          scrolling={defaultScrolling}
          rows={listed}
          renderRow={(index) => keys[index]}
          selectedKey={selectedKey}
          label="Files"
          treeItemOf={
            tree
              ? (index) =>
                  index === 0
                    ? { level: 1, expanded: true }
                    : { level: index === 1 ? 2 : 1 }
              : undefined
          }
          onKeyDown={noop}
          initialRect={{ width: 400, height: 240 }}
        />,
      ),
    ).window.document;

  test('tells that the rows form a tree, how deep each lies, whether a folder is open, and which row is picked', () => {
    const document = drawn('file:a/b', true);
    const tree = document.querySelector('[role="tree"]');
    assert.strictEqual(tree?.getAttribute('aria-label'), 'Files');
    assert.deepStrictEqual(
      Array.from(document.querySelectorAll('[role="treeitem"]'), (item) => [
        item.textContent,
        item.getAttribute('aria-level'),
        item.getAttribute('aria-expanded'),
        item.getAttribute('aria-selected'),
      ]),
      [
        ['folder:a', '1', 'true', 'false'],
        ['file:a/b', '2', null, 'true'],
        ['file:c', '1', null, 'false'],
      ],
    );
    assert.strictEqual(
      document.getElementById(tree.getAttribute('aria-activedescendant') ?? '')
        ?.textContent,
      'file:a/b',
    );
  });

  test('tells that the rows form a list without levels', () => {
    const document = drawn('file:c', false);
    const list = document.querySelector('[role="listbox"]');
    assert.ok(list);
    assert.strictEqual(document.querySelectorAll('[role="option"]').length, 3);
    assert.strictEqual(
      document
        .getElementById(list.getAttribute('aria-activedescendant') ?? '')
        ?.getAttribute('aria-selected'),
      'true',
    );
  });
});
