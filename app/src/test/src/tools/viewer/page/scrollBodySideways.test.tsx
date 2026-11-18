import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test } from 'vitest';
import { ScrollBody } from '../../../../../tools/viewer/page/scrollBody';
import { renderIn } from '../../../../helpers/componentFixtures';

async function inDom(
  run: (
    dom: JSDOM,
    root: { render: (node: React.ReactNode) => void },
  ) => Promise<void>,
): Promise<void> {
  const dom = new JSDOM('<!doctype html><main></main>', {
    pretendToBeVisual: true,
  });
  const globals = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    ResizeObserver: class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const saved = Object.fromEntries(
    Object.keys(globals).map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  try {
    const { createRoot } = await import('react-dom/client');
    const main = dom.window.document.querySelector('main');
    assert.ok(main);
    const root = createRoot(main);
    try {
      await run(dom, root);
    } finally {
      await act(async () => root.unmount());
    }
  } finally {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor === undefined) {
        Reflect.deleteProperty(globalThis, name);
      } else {
        Object.defineProperty(globalThis, name, descriptor);
      }
    }
  }
}

const body = (lefts: number[], { wrapped = false, settled = false } = {}) => (
  <ScrollBody
    thumb={undefined}
    ends={{ atStart: true, atEnd: true }}
    onScreen={() => {}}
    move={() => {}}
    jump={() => {}}
    error={undefined}
    keptLeft={300}
    wrapped={wrapped}
    settled={settled}
    onLeft={(left) => lefts.push(left)}
  >
    text
  </ScrollBody>
);

const scrolledTo = async (dom: JSDOM, left: number) => {
  const area = dom.window.document.querySelector('.viewer-sideways');
  assert.ok(area);
  Object.defineProperty(area, 'scrollLeft', {
    configurable: true,
    writable: true,
    value: left,
  });
  await act(async () => {
    area.dispatchEvent(new dom.window.Event('scroll'));
  });
};

suite('Commander scroll body coming back sideways', () => {
  test('keeps where it is scrolled sideways while it still waits to come back to where it was, and once its text is laid out whole and cannot reach that, keeps where it is scrolled to since', () =>
    inDom(async (dom, root) => {
      const lefts: number[] = [];
      await act(async () => renderIn(root, body(lefts)));
      await scrolledTo(dom, 10);
      assert.deepStrictEqual(lefts, []);

      await act(async () => renderIn(root, body(lefts, { settled: true })));
      await scrolledTo(dom, 20);
      assert.deepStrictEqual(lefts, [20]);
    }));

  test('gives up coming back sideways once its rows wrap, as wrapped rows scroll nowhere sideways', () =>
    inDom(async (dom, root) => {
      const lefts: number[] = [];
      await act(async () => renderIn(root, body(lefts)));
      await act(async () => renderIn(root, body(lefts, { wrapped: true })));
      await act(async () => renderIn(root, body(lefts)));
      await scrolledTo(dom, 40);
      assert.deepStrictEqual(lefts, [40]);
    }));
});
