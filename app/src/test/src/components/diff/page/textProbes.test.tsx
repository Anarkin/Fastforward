import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test } from 'vitest';
import { TextProbe } from '../../../../../components/diff/page/textProbes';

suite('Renamed files', () => {
  test('measures the height of a line of code as the diff is first drawn, not only once it is drawn again, so a diff shown anew, as on changing tabs, does not draw its rows first as tall as a guess', async () => {
    const dom = new JSDOM('<!doctype html><main></main>');
    const lineHeight = 17;
    dom.window.matchMedia = () =>
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      ({
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList;
    const styleOf = (element: Element) =>
      Object.assign(Object.create(null), {
        lineHeight: element.classList.contains('diff-line')
          ? `${lineHeight}px`
          : 'normal',
        letterSpacing: 'normal',
      });
    Object.assign(dom.window, { getComputedStyle: styleOf });
    const globals = {
      window: dom.window,
      document: dom.window.document,
      devicePixelRatio: 1,
      getComputedStyle: styleOf,
      ResizeObserver: class {
        observe(): void {}
        disconnect(): void {}
      },
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    const saved = Object.fromEntries(
      Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
    );
    Object.assign(globalThis, globals);
    try {
      const { createRoot } = await import('react-dom/client');
      const main = dom.window.document.querySelector('main');
      assert.ok(main);
      const measured: number[] = [];
      const root = createRoot(main);
      await act(async () => {
        root.render(
          <TextProbe
            onMeasure={(_width, _font, _padding, _scale, line) =>
              measured.push(line)
            }
          />,
        );
      });
      assert.deepStrictEqual(measured, [lineHeight]);
      await act(async () => {
        root.unmount();
      });
    } finally {
      Object.assign(globalThis, saved);
    }
  });
});
